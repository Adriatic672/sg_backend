import express, { Request, Response } from 'express';
import CompanyServices from '../models/accounts.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import Wallet from '../models/wallet.model';
import { VERSION_CODE } from '../app';

const pay = new Wallet();
const router = express.Router();
const companyServices = new CompanyServices();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};
const applyJWTAccessConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyTokenAccess(req, res, next);
};

const logCount = (req: Request, res: Response, next: any) => {
  // Middleware to log the number of requests
  const ip = req.ip || "";
  req.body.ip = ip;
  pay.handleUserLogin(req.body);
  console.log(`Request Count: ${req.method} ${req.originalUrl}`);
  next();
};

router.get('/', welcome);
router.get('/version', version);
router.post('/signup', signup);
router.post('/login', login);
router.post('/sso/google', googleSignOn);
router.post('/sso/apple', appleSignOn);
router.post('/sso/social', applyJWTConditionally, socialSignOn);
router.get('/levels', getLevels);

router.post('/verifyEmail', verifyEmail);

router.get('/auth', applyJWTConditionally, Auth);
router.post('/verifyPhone', applyJWTConditionally, verifyPhone);
router.post('/resetPasswordRequest', resetPasswordRequest);
router.post('/confirmResetPassword', confirmResetPassword);
router.post('/sendEmailOTP', sendEmailOTP);
router.post('/sendPhoneOTP', applyJWTConditionally, sendPhoneOTP);
router.post('/changePassword', applyJWTConditionally, changePassword);
router.post('/refreshJWT', applyJWTConditionally, refreshJWT);
router.get('/getUserByPhoneNumber/:id', applyJWTConditionally, getUserByPhoneNumber);
router.get('/getUserById/:id', applyJWTConditionally, getUserById);
router.get('/getUserProfile', applyJWTConditionally, logCount, getUserProfile);
router.patch('/updateProfile', applyJWTConditionally, updateProfile);

router.patch('/updatePhoneNumber', applyJWTConditionally, updatePhone);
router.post('/requestPhoneNumberchange', applyJWTConditionally, requestPhoneNumberchange);
router.post('/changeUsername', applyJWTConditionally, changeUsername);
router.get('/countries', countries);
router.get('/industries', industries);
router.get('/socialSites', applyJWTConditionally, socialSites);
router.post('/addSocialSite', applyJWTConditionally, addSocialSite);
router.patch('/editSocialSite', applyJWTConditionally, editSocialSite);
router.get('/userSocialSites', applyJWTConditionally, userSocialSites);
router.get('/infuencers', applyJWTConditionally, getInfuencers);
router.get('/brands', applyJWTConditionally, getBrands);
router.get('/refreshToken', applyJWTAccessConditionally, refreshToken);
router.get('/leaderBoard', applyJWTConditionally, leaderBoard);
router.get('/searchUser', applyJWTConditionally, searchUser);
router.get('/checkIfReceibedBonus', applyJWTConditionally, checkIfReceibedBonus);
router.get('/myferals', applyJWTConditionally, getMyFerals);
router.post('/verifyBusiness', applyJWTConditionally, verifyBusiness);
router.post('/addBusinessStaff', applyJWTConditionally, addBusinessStaff);

router.get('/influencerDetails/:id', applyJWTConditionally, getInfluencerDetails);

router.post('/secureAccount', JWTMiddleware.verifyTemporaryToken, secureAccount);
router.patch('/updateIndustries', JWTMiddleware.verifyTemporaryToken, updateProfile);
router.get('/reviews/:id', applyJWTConditionally, getReviews);
router.get('/updateSocialProfiles', applyJWTConditionally, updateSocialProfiles);
router.post('/resyncFollowers', resyncFollowers);
router.post('/requestAccountDeletion', applyJWTConditionally, requestAccountDeletion);
router.post('/revokeAccountDeletionRequest', applyJWTConditionally, revokeAccountDeletionRequest);

async function revokeAccountDeletionRequest(req: Request, res: Response) {
  try {
    const result = await companyServices.revokeAccountDeletionRequest(req.body);
    res.status(result.status || 200).json(result);
  } catch (error) {
    res.status(500).json({ status: 500, message: 'Error revoking account deletion request', error });
  }
}



async function Auth(req: Request, res: Response) {
  try {
    const response = {
      ok: true,
      message: "session is valid"
    }
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}
async function getInfluencerDetails(req: Request, res: Response) {
  try {
    const result = await companyServices.getInfluencerDetails(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}
async function updateSocialProfiles(req: Request, res: Response) {
  try {
    const userId = req.body.user_id || null
    const result = await companyServices.updateSocialProfiles(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function getReviews(req: Request, res: Response) {
  try {
    const result = await companyServices.getReviews(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}
async function secureAccount(req: Request, res: Response) {
  try {
    const result = await companyServices.secureAccount(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function addBusinessStaff(req: Request, res: Response) {
  try {
    const result = await companyServices.addBusinessStaff(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function verifyBusiness(req: Request, res: Response) {
  try {
    const result = await companyServices.verifyBusiness(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}
async function getMyFerals(req: Request, res: Response) {
  try {
    const result = await companyServices.getMyFerals(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function getLevels(req: Request, res: Response) {
  try {
    const result = await companyServices.Levels();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error checking bonus', error });
  }
}
async function checkIfReceibedBonus(req: Request, res: Response) {
  try {
    const result = await companyServices.checkIfReceibedBonus();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error checking bonus', error });
  }
}

async function searchUser(req: Request, res: Response) {
  try {
    const result = await companyServices.searchUser(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function googleSignOn(req: Request, res: Response) {
  try {
    req.body.source = "google";
    const result = await companyServices.googleSignOn(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function appleSignOn(req: Request, res: Response) {
  try {
    req.body.source = "apple";
    const result = await companyServices.appleSignOn(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function socialSignOn(req: Request, res: Response) {

  try {
    const result = await companyServices.socialSignOn(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}


async function refreshToken(req: Request, res: Response) {
  try {
    const result = await companyServices.refreshToken(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function updatePhone(req: Request, res: Response) {

  try {
    const result = await companyServices.updatePhone(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function requestPhoneNumberchange(req: Request, res: Response) {

  try {
    const result = await companyServices.requestPhoneNumberchange(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function changeUsername(req: Request, res: Response) {
  try {
    const result = await companyServices.changeUsername(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function getInfuencers(req: Request, res: Response) {
  try {
    const result = await companyServices.getUsersbyType('influencer');
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}
async function getBrands(req: Request, res: Response) {
  try {
    const result = await companyServices.getUsersbyType('brand');
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function refreshJWT(req: Request, res: Response) {
  try {
    const result: any = []
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}



async function userSocialSites(req: Request, res: Response) {
  try {
    const result = await companyServices.userSocialSites(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function addSocialSite(req: Request, res: Response) {
  try {
    const result = await companyServices.addSocialSite(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function editSocialSite(req: Request, res: Response) {
  try {
    const result = await companyServices.editSocialSite(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function socialSites(req: Request, res: Response) {
  try {
    const result = await companyServices.socialSites();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}



async function countries(req: Request, res: Response) {
  try {
    const result = await companyServices.countries();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function industries(req: Request, res: Response) {
  try {
    const result = await companyServices.industries();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}



async function getUserById(req: Request, res: Response) {
  try {
    const result = await companyServices.queryUserInfo(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function getUserByPhoneNumber(req: Request, res: Response) {
  try {
    const result = await companyServices.getUserByPhoneNumber(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}
async function getUserProfile(req: Request, res: Response) {
  try {
    const result = await companyServices.getUserProfile(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}


async function updateProfile(req: Request, res: Response) {
  try {
    const result = await companyServices.updateProfile(req.body);
    companyServices.logOperation("UPDATE_PROFILE", req.body.userId, "UPDATE_PROFILE", req.body, result);
    res.status(200).json(result);
  } catch (error) {
    companyServices.logOperation("UPDATE_PROFILE", req.body.userId, "UPDATE_PROFILE", req.body, error);
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function sendEmailOTP(req: Request, res: Response) {
  try {
    const result = await companyServices.sendEmailOTP(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function sendPhoneOTP(req: Request, res: Response) {
  try {
    const result = await companyServices.sendPhoneOTP(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function resetPasswordRequest(req: Request, res: Response) {
  try {
    const result = await companyServices.resetPasswordRequest(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function resyncFollowers(req: Request, res: Response) {
  try {
    const result = await companyServices.resyncFollowers(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}
async function confirmResetPassword(req: Request, res: Response) {
  try {
    const result = await companyServices.resetPassword(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function changePassword(req: Request, res: Response) {
  try {
    const result = await companyServices.changePassword(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding company', error });
  }
}

async function version(req: Request, res: Response) {
  try {
    res.status(200).json(VERSION_CODE);
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
}


async function welcome(req: Request, res: Response) {
  try {
    res.status(200).json("Welcome to SocialGems API, V2");
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
}

async function login(req: Request, res: Response) {
  try {
    const result = await companyServices.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
}

async function signup(req: Request, res: Response) {
  try {
    req.body.source = "email";
    const result = await companyServices.signup(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error signing up', error });
  }
}

async function verifyEmail(req: Request, res: Response) {
  try {
    const result = await companyServices.verifyEmail(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying email', error });
  }
}

async function verifyPhone(req: Request, res: Response) {
  try {
    const result = await companyServices.verifyPhone(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}

async function leaderBoard(req: Request, res: Response) {
  try {
    const result = await companyServices.leaderBoard();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}

async function requestAccountDeletion(req: Request, res: Response) {
  try {
    const result = await companyServices.requestAccountDeletion(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ status: 500, message: 'Error processing account deletion request' });
  }
}

export default router;
