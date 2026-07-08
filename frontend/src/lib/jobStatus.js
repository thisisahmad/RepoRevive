export const STATUS_META = {
  queued: { label: 'Queued', color: 'text-muted-dark', dot: 'bg-muted-dark' },
  cloning: { label: 'Cloning', color: 'text-foreground', dot: 'bg-accent' },
  detecting: { label: 'Detecting', color: 'text-foreground', dot: 'bg-accent' },
  installing: { label: 'Installing', color: 'text-foreground', dot: 'bg-accent' },
  running: { label: 'Running', color: 'text-foreground', dot: 'bg-accent' },
  fixing: { label: 'Fixing', color: 'text-foreground', dot: 'bg-accent' },
  succeeded: { label: 'Succeeded', color: 'text-accent', dot: 'bg-accent' },
  failed: { label: 'Failed', color: 'text-error', dot: 'bg-error' },
  unsupported_stack: { label: 'Unsupported', color: 'text-yellow-500', dot: 'bg-yellow-500' },
}
