import express, { Request, Response } from 'express';
import Model from "../helpers/model";
import db from "../helpers/db.helper";

const router = express.Router();
const model = new Model();

router.get('/ping-db', async (_req: Request, res: Response) => {
  try {
    const result = await db.pdo('SELECT 1 AS ok');
    res.json({ db: 'connected', result });
  } catch (error: any) {
    res.status(500).json({ db: 'failed', error: error.message, code: error.code });
  }
});

router.post('/debug-login', async (req: Request, res: Response) => {
  const { email } = req.body;
  console.log('Debug login - email:', email);

  const users: any = await model.callQuerySafe(`SELECT user_id, email, user_type, status FROM users WHERE email = '${email}'`);
  console.log('Users found:', users.length, users);

  res.json({ email, usersFound: users.length, users });
});

export default router;