import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User } from '../types';
import { createUser, findUserByEmail } from './store';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function issueToken(user: User): string {
  return jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: '7d' });
}

function toPublicUser(user: User) {
  return { id: user.id, email: user.email };
}

// POST /api/auth/register  { email, password } -> 201 { token, user }
router.post('/register', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'a valid email is required' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (findUserByEmail(normalizedEmail)) {
    return res.status(409).json({ error: 'an account with that email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser(normalizedEmail, passwordHash);
  return res.status(201).json({ token: issueToken(user), user: toPublicUser(user) });
});

// POST /api/auth/login  { email, password } -> 200 { token, user }
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = findUserByEmail(email.trim().toLowerCase());
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    return res.status(401).json({ error: 'invalid email or password' });
  }

  return res.json({ token: issueToken(user), user: toPublicUser(user) });
});

export default router;
