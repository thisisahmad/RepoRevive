import Docker from 'dockerode';
import { Writable } from 'stream';
import * as tar from 'tar-stream';

// docker-modem picks the right default per platform:
// //./pipe/docker_engine on Windows, /var/run/docker.sock elsewhere.
export const docker = new Docker();

const pulledImages = new Set<string>();

export async function ensureImage(image: string): Promise<void> {
  if (pulledImages.has(image)) return;
  try {
    await docker.getImage(image).inspect();
    pulledImages.add(image);
    return;
  } catch {
    // not present locally — pull it
  }
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (doneErr: Error | null) =>
        doneErr ? reject(doneErr) : resolve()
      );
    });
  });
  pulledImages.add(image);
}

export interface CreateContainerOpts {
  image: string;
  jobId: string;
  namePrefix: string;
}

/**
 * One isolated container per job. No host volume mounts (the constraint:
 * everything repo-related stays inside the container). `sleep` keeps it
 * alive so we can drive it with docker exec; 1h is a hard upper bound on
 * any job's lifetime.
 */
export async function createJobContainer(opts: CreateContainerOpts): Promise<Docker.Container> {
  await ensureImage(opts.image);
  const container = await docker.createContainer({
    Image: opts.image,
    name: `${opts.namePrefix}-${opts.jobId}`,
    Entrypoint: ['sleep'],
    Cmd: ['3600'],
    Labels: { 'reporevive.jobId': opts.jobId },
    WorkingDir: '/workspace',
    HostConfig: {
      Memory: 1024 * 1024 * 1024, // 1 GiB
      MemorySwap: 1024 * 1024 * 1024, // = Memory -> no swap
      NanoCpus: 1_000_000_000, // 1 CPU
      PidsLimit: 256,
      SecurityOpt: ['no-new-privileges'],
    },
  });
  await container.start();
  return container;
}

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ExecOpts {
  workdir?: string;
  timeoutMs?: number;
}

/** Run a command inside the container via docker exec and capture output. */
export async function execInContainer(
  container: Docker.Container,
  cmd: string[],
  opts: ExecOpts = {}
): Promise<ExecResult> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    ...(opts.workdir ? { WorkingDir: opts.workdir } : {}),
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const sink = (chunks: Buffer[]) =>
    new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });
  docker.modem.demuxStream(stream, sink(stdoutChunks), sink(stderrChunks));

  let timedOut = false;
  await new Promise<void>((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const finish = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };
    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', finish);
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        stream.destroy();
        finish();
      }, opts.timeoutMs);
    }
  });

  let exitCode: number | null = null;
  if (!timedOut) {
    try {
      exitCode = (await exec.inspect()).ExitCode ?? null;
    } catch {
      // container may already be gone; leave exitCode null
    }
  }

  return {
    exitCode,
    stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
    timedOut,
  };
}

/**
 * Pulls a single file out of the container via Docker's archive endpoint
 * (no in-container tooling required) and returns its raw bytes. Docker
 * always wraps the result in a tar stream, even for one file, so we unwrap
 * it with tar-stream rather than shelling out to `tar`.
 */
export async function copyFileFromContainer(container: Docker.Container, containerPath: string): Promise<Buffer> {
  const archiveStream: NodeJS.ReadableStream = await container.getArchive({ path: containerPath });

  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    let fileBuffer: Buffer | null = null;

    extract.on('entry', (_header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
        next();
      });
      stream.resume();
    });
    extract.on('finish', () => {
      if (fileBuffer) resolve(fileBuffer);
      else reject(new Error(`no file found at ${containerPath}`));
    });
    extract.on('error', reject);

    archiveStream.pipe(extract);
  });
}

export async function destroyContainer(container: Docker.Container): Promise<void> {
  try {
    await container.remove({ force: true });
  } catch (err) {
    console.warn('failed to remove container:', err instanceof Error ? err.message : err);
  }
}
