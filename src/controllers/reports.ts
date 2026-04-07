import express, { Request, Response } from 'express';
import CompanyServices from '../models/reports';
import { JWTMiddleware } from '../helpers/jwt.middleware';

const router = express.Router();
const companyServices = new CompanyServices();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

router.get('/userTrend', applyJWTConditionally, userTrend);
router.get('/topPayouts', applyJWTConditionally, getPayouts);
router.get('/brandPayouts', applyJWTConditionally, getBrandPayouts);

async function getBrandPayouts(req: Request, res: Response) {
  try {
    const result = await companyServices.BrandPayouts(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching brand payouts', error });
  }
}
async function getPayouts(req: Request, res: Response) {
  try {
    const result = await companyServices.getPayouts();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user details', error });
  }
}
async function userTrend(req: Request, res: Response) {
  try {
    const result = await companyServices.homeDashboard();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user details', error });
  }
}
export default router;
