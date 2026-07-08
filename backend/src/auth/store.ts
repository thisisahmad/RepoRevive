import { randomUUID } from 'crypto';
import { db } from '../db';
import { User } from '../types';

export function createUser(email: string, passwordHash: string): User {
  const user: User = { id: randomUUID(), email, passwordHash, createdAt: new Date().toISOString() };
  db.prepare(
    `INSERT INTO users (id, email, passwordHash, createdAt) VALUES (@id, @email, @passwordHash, @createdAt)`
  ).run(user);
  return user;
}

export function findUserByEmail(email: string): User | null {
  return (db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined) ?? null;
}
