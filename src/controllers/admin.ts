import express, { Request, Response } from 'express';
import CompanyServices from '../models/admin';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import GemsAI from '../thirdparty/GemsAI';

const router = express.Router();
const companyServices = new CompanyServices();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

router.post('/login', login);
router.get('/viewUsers', applyJWTConditionally, viewUsers);
router.get('/viewBrands', applyJWTConditionally, viewBrands);
router.post('/deactivateUser', applyJWTConditionally, deleteAccount);
router.post('/activateUser', applyJWTConditionally, activateUser);
router.post('/deactivateBrand', applyJWTConditionally, deactivateBrand);
router.post('/editBrandName', applyJWTConditionally, editBrandName);
router.get('/viewAdminUsers', applyJWTConditionally, viewAdminUsers);
router.post('/deleteTask', applyJWTConditionally, deleteTask);
router.post('/updateTask/:id', applyJWTConditionally, updateTask);
router.get('/getStats', applyJWTConditionally, getStats);
router.get('/getUserGrowth', applyJWTConditionally, getusers);
router.get('/getApplicationsPerCampaign', applyJWTConditionally, getApplicationsPerCampaign);
router.get('/getWalletStats', applyJWTConditionally, getWalletStats);
router.get('/getWallets/:currency', applyJWTConditionally, getWallets);
router.get('/adminWallets', applyJWTConditionally, adminWallets);
router.get('/getUsersByRegion', applyJWTConditionally, getUsersByRegion);
router.get('/getPaymentTypes', applyJWTConditionally, getPaymentTypes);
router.get('/getUsers', applyJWTConditionally, getUsers);
router.post('/updateExchangeRates', applyJWTConditionally, updateExchangeRates);
router.get('/refreshRates', applyJWTConditionally, refreshExchangeRates);
router.post('/createDepositRequest', applyJWTConditionally, createDepositRequest);




router.post('/addAdvert', applyJWTConditionally, addAdvert);
router.get('/getAdverts', applyJWTConditionally, getAdverts);
router.get('/getAdvert/:id', applyJWTConditionally, getAdvertById);
router.put('/updateAdvert/:id', applyJWTConditionally, updateAdvert);
router.delete('/deleteAdvert/:id', applyJWTConditionally, deleteAdvert);
router.get('/getCampaigns', applyJWTConditionally, getCampaigns);
router.get('/getWalletTransactions', applyJWTConditionally, getWalletTransactions);
router.get('/getGroups', applyJWTConditionally, getGroups);
router.get('/getUserWallet/:id', applyJWTConditionally, getUserWallet);
router.get('/notificationTemplates', applyJWTConditionally, getNotificationTemplates);
router.post('/editNotificationTemplate', applyJWTConditionally, editNotificationTemplate);
router.get('/getTemplatesLiterals', applyJWTConditionally, getTemplatesLiterals);
router.get('/sites', applyJWTConditionally, sites);
router.delete('/sites/:socialId', applyJWTConditionally, deleteSocialSite);
router.get('/userDetails/:id', applyJWTConditionally, viewUserDetails);
router.get('/brandDetails/:id', applyJWTConditionally, viewBrandDetails);
router.get('/campaignFees', applyJWTConditionally, getCampaignFees);
router.post('/editCampaignFees', applyJWTConditionally, editCampaignFees);

router.get('/objectives', applyJWTConditionally, getObjectives);
router.post('/addObjective', applyJWTConditionally, addObjective);
router.post('/editObjective/:id', applyJWTConditionally, editObjective);
router.get('/deleteObjective/:id', applyJWTConditionally, deleteObjective);


router.post('/editVideo', applyJWTConditionally, editVideo);
router.get('/deleteVideo/:id', applyJWTConditionally, deleteVideo);
router.post('/adminRegister', applyJWTConditionally, addAdminUser);
router.post('/deactivateAdminUser', applyJWTConditionally, deactivateAdminUser);
router.post('/reactivateAdminUser', applyJWTConditionally, reactivateAdminUser);
router.post('/resetPassword', applyJWTConditionally, resetPassword);
router.post('/changePassword', applyJWTConditionally, changePassword);
router.post('/sendNotification', applyJWTConditionally, sendNotification);
router.post('/approveNotification', applyJWTConditionally, approveNotification);
router.get('/getNotifications', applyJWTConditionally, getNotifications);

router.get('/getPendingNews', applyJWTConditionally, getPendingNews);
router.post('/createNews', applyJWTConditionally, createNews);
router.post('/approveNews', applyJWTConditionally, approveNews);
router.get('/newsCategories', applyJWTConditionally, newsCategories);
router.post('/addRate', applyJWTConditionally, addRate);
router.get('/getRates', applyJWTConditionally, getRates);
router.put('/updateRate/:id', applyJWTConditionally, updateRate);
router.put('/syncChannels', applyJWTConditionally, syncChannels);
router.post('/ai-query', applyJWTConditionally, runAIQuery);
router.get('/ai-query/predefined/:type', applyJWTConditionally, runPredefinedQuery);
router.get('/getBusinessRegistrations', applyJWTConditionally, getBusinessRegistrations);
router.get('/getPendingBusinessRegistrations', applyJWTConditionally, getPendingBusinessRegistrations);
router.post('/approveBusiness', applyJWTConditionally, approveBusiness);
router.get('/getVerifiedBusinessRegistrations', applyJWTConditionally, getVerifiedBusinessRegistrations);
router.get('/industries', applyJWTConditionally, getIndustries);
router.get('/posts', applyJWTConditionally, getAllPosts);
router.get('/posts/reported', applyJWTConditionally, getReportedPosts);
router.delete('/posts/:id', applyJWTConditionally, deletePost);
router.get('/posts/analytics', applyJWTConditionally, getPostsAnalytics);
router.get('/posts/filters', applyJWTConditionally, getPostsFilters);
router.post('/verifyEmail', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPasswordWithOTP);
router.get('/getUsersByRegion', applyJWTConditionally, getUsersByRegion);


async function getUsersByRegion(req: Request, res: Response) {
  try {
    const result = await companyServices.getUsersByRegion();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users by region', error });
  }
}

async function getPaymentTypes(req: Request, res: Response) {
  try {
    const { country = 'all', operation = 'ALL' } = req.query;
    const Wallet = require('../models/wallet.model').default;
    const wallet = new Wallet();
    const result = await wallet.getPaymentTypes(operation as string, country as string);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payment types', error });
  }
}

async function getUsers(req: Request, res: Response) {
  try {
    const { country = 'all', level_id, industry_ids } = req.query;
    const result = await companyServices.viewUsers("influencer", country as string, level_id as string, industry_ids as string);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error });
  }
}

async function updateExchangeRates(req: Request, res: Response) {
  try {
    // Import Wallet model to access the method
    const Wallet = require('../models/wallet.model').default;
    const wallet = new Wallet();
    const result = await wallet.fetchAndUpdateExchangeRates();
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating exchange rates', error });
  }
}

async function refreshExchangeRates(req: Request, res: Response) {
  try {
    // Import Wallet model to access the method
    const Wallet = require('../models/wallet.model').default;
    const wallet = new Wallet();
    const result = await wallet.fetchAndUpdateExchangeRates();
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error refreshing exchange rates', error });
  }
}

async function createDepositRequest(req: Request, res: Response) {
  try {
    // Import Wallet model to access the method
    const Wallet = require('../models/wallet.model').default;
    const wallet = new Wallet();
    
    // Create the deposit request with PENDING status
    const depositData = {
      ...req.body,
      status: 'PENDING' // Force PENDING status for admin-created deposits
    };
    
    const result = await wallet.depositRequest(depositData);
    
    if (result.status === 200) {
      // Return success message indicating it will appear in pending deposits
      res.status(200).json({
        status: 200,
        message: 'Deposit request created successfully and sent for approval',
        data: {
          ...result.data,
          status: 'PENDING',
          requires_approval: true,
          message: 'This deposit will appear in the Pending Deposits section for approval'
        }
      });
    } else {
      res.status(result.status).json(result);
    }
    
  } catch (error) {
    console.error('Error creating deposit request:', error);
    res.status(500).json({ message: 'Error creating deposit request', error });
  }
}


async function deleteAccount(req: Request, res: Response) {
  try {
    const result = await companyServices.deleteAccount(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting account', error });
  }
}

async function activateUser(req: Request, res: Response) {
  try {
    const result = await companyServices.activateUser(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error activating user', error });
  }
}
async function deactivateBrand(req: Request, res: Response) {
  try {
    const result = await companyServices.deactivateBrand(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deactivating brand', error });
  }
}

async function editBrandName(req: Request, res: Response) {
  try {
    const result = await companyServices.editBrandName(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error editing brand name', error });
  }
}

async function getVerifiedBusinessRegistrations(req: Request, res: Response) {
  try {
    const result = await companyServices.getVerifiedBusinessRegistrations();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving verified business registrations', error });
  }
}

async function getIndustries(req: Request, res: Response) {
  try {
    const result = await companyServices.getIndustries();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving industries', error });
  }
}

async function getPendingBusinessRegistrations(req: Request, res: Response) {
  try {
    const result = await companyServices.getPendingBusinessRegistrations();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending business registrations', error });
  }
}
async function getBusinessRegistrations(req: Request, res: Response) {
  try {
    const result = await companyServices.getBusinessRegistrations();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching business registrations', error });
  }
}

async function approveBusiness(req: Request, res: Response) {
  try {
    const result = await companyServices.approveBusiness(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error approving business', error });
  }
}

async function syncChannels(req: Request, res: Response) {
  try {
    const result = await companyServices.getAllFCMTokens();
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding rate', error });
  }
}



async function addRate(req: Request, res: Response) {
  try {
    const result = await companyServices.addRate(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding rate', error });
  }
}

async function getRates(req: Request, res: Response) {
  try {
    const result = await companyServices.getRates();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rates', error });
  }
}



async function updateRate(req: Request, res: Response) {
  try {
    const result = await companyServices.updateRate(Number(req.params.id), req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating rate', error });
  }
}



async function getPendingNews(req: Request, res: Response) {
  try {
    const result = await companyServices.getPendingNews();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending news', error });
  }
}

async function createNews(req: Request, res: Response) {
  try {
    const result = await companyServices.createNews(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error creating news', error });
  }
}

async function approveNews(req: Request, res: Response) {
  try {
    const result = await companyServices.approveNews(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error approving news', error });
  }
}

async function newsCategories(req: Request, res: Response) {
  try {
    const result = await companyServices.newsCategories();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching news categories', error });
  }
}
async function getNotifications(req: Request, res: Response) {
  try {
    const result = await companyServices.getNotifications();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications', error });
  }
}
async function sendNotification(req: Request, res: Response) {
  try {
    const result = await companyServices.sendNotification(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error sending notification', error });
  }
}

async function approveNotification(req: Request, res: Response) {
  try {
    const result = await companyServices.approveNotification(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error approving notification', error });
  }
}

router.get('/reports/userByCountry', applyJWTConditionally, userByCountry);
async function userByCountry(req: Request, res: Response) {
  try {
    const result = await companyServices.userByCountry();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password', error });
  }
}

async function resetPassword(req: Request, res: Response) {
  try {
    const result = await companyServices.resetPassword(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password', error });
  }
}
async function deactivateAdminUser(req: Request, res: Response) {
  try {
    const result = await companyServices.deactivateAdminUser(req.body.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deactivating admin user', error });
  }
}

async function reactivateAdminUser(req: Request, res: Response) {
  try {
    const result = await companyServices.reactivateAdminUser(req.body.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error reactivating admin user', error });
  }
}
async function addAdminUser(req: Request, res: Response) {
  try {
    const result = await companyServices.addAdminUser(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding admin user', error });
  }
}


async function editVideo(req: Request, res: Response) {
  try {
    const result = await companyServices.editVideo(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error editing video', error });
  }
}

async function deleteVideo(req: Request, res: Response) {
  try {
    const result = await companyServices.deleteVideo(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting video', error });
  }
}
async function getObjectives(req: Request, res: Response) {
  try {
    const result = await companyServices.getObjectives();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching objectives', error });
  }
}
async function addObjective(req: Request, res: Response) {
  try {
    const result = await companyServices.addObjective(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding objective', error });
  }
}

async function editObjective(req: Request, res: Response) {
  try {
    const result = await companyServices.editObjective(Number(req.params.id), req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error editing objective', error });
  }
}

async function deleteObjective(req: Request, res: Response) {
  try {
    const result = await companyServices.deleteObjective(Number(req.params.id));
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting objective', error });
  }
}
async function adminWallets(req: Request, res: Response) {
  try {
    const result = await companyServices.adminWallets();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admin wallets', error });
  }
}
async function getCampaignFees(req: Request, res: Response) {
  try {
    const result = await companyServices.getCampaignFees();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaign fees', error });
  }
}

async function editCampaignFees(req: Request, res: Response) {
  try {
    const result = await companyServices.editCampaignFees(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error editing campaign fees', error });
  }
}
async function viewUserDetails(req: Request, res: Response) {
  try {
    const result = await companyServices.viewUserDetails(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user details', error });
  }
}

async function viewBrandDetails(req: Request, res: Response) {
  try {
    const result = await companyServices.viewBrandDetails(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching brand details', error });
  }
}


async function sites(req: Request, res: Response) {
  try {
    const result = await companyServices.sites();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching template literals', error });
  }
}

async function deleteSocialSite(req: Request, res: Response) {
  try {
    const { socialId } = req.params;
    const userId = req.body.userId; // From JWT middleware
    
    // Get the social site details first to get user_id and site_id
    const socialSiteResponse: any = await companyServices.getSocialSiteById(socialId);
    const socialSiteDetails = socialSiteResponse || [];
    if (!socialSiteDetails || socialSiteDetails.length === 0) {
      return res.status(404).json({ message: 'Social site not found' });
    }
    
    const socialSite = socialSiteDetails[0];
    const deleteData = {
      user_id: socialSite.user_id,
      site_id: socialSite.site_id,
      userId: userId
    };
    
    const result = await companyServices.deleteSocialSiteUser(deleteData);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error deleting social site:', error);
    res.status(500).json({ message: 'Error deleting social site', error });
  }
}

async function getTemplatesLiterals(req: Request, res: Response) {
  try {
    const result = await companyServices.getTemplatesLiterals();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching template literals', error });
  }
}
async function editNotificationTemplate(req: Request, res: Response) {
  try {
    const result = await companyServices.editNotificationTemplate(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error editing notification template', error });
  }
}

async function getNotificationTemplates(req: Request, res: Response) {
  try {
    const result = await companyServices.getNotificationTemplates();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notification templates', error });
  }
}
async function getUserWallet(req: Request, res: Response) {
  try {
    const result = await companyServices.getUserWalletById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user wallet', error });
  }
}
async function getGroups(req: Request, res: Response) {
  try {
    const result = await companyServices.getGroups();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching groups', error });
  }
}
async function getWalletTransactions(req: Request, res: Response) {
  try {
    const result = await companyServices.getWalletTransactions("USD");
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching wallet transactions', error });
  }
}

async function getCampaigns(req: Request, res: Response) {
  try {
    const result = await companyServices.getCampaigns();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaigns', error });
  }
}



async function getWalletStats(req: Request, res: Response) {
  try {
    const result = await companyServices.getWalletStats();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error viewing users', error });
  }
}

async function getWallets(req: Request, res: Response) {
  try {
        const result = await companyServices.getWallets(req.params.currency,req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching wallets', error });
  }
}

async function getusers(req: Request, res: Response) {
  try {
    const result = await companyServices.getusers();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error viewing users', error });
  }
}
async function getStats(req: Request, res: Response) {
  try {
    const result = await companyServices.getStats();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error viewing users', error });
  }
}

async function getApplicationsPerCampaign(req: Request, res: Response) {
  try {
    const result = await companyServices.getApplicationsPerCampaign();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching applications per campaign', error });
  }
}



async function updateTask(req: Request, res: Response) {
  try {
    const result = await companyServices.updateTask(req.body, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error viewing users', error });
  }
}



async function deleteTask(req: Request, res: Response) {
  try {
    const result = await companyServices.deleteTask(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error viewing users', error });
  }
}
async function login(req: Request, res: Response) {
  try {
    const result = await companyServices.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error viewing users', error });
  }
}


async function viewAdminUsers(req: Request, res: Response) {
  try {
    const result = await companyServices.viewAdminUsers();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding property', error });
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

async function viewUsers(req: Request, res: Response) {
  try {
    const iso_code = typeof req.query.iso_code === 'string' ? req.query.iso_code : 'all';
    const level_id = typeof req.query.level_id === 'string' ? req.query.level_id : undefined;
    const industry_ids = typeof req.query.industry_ids === 'string' ? req.query.industry_ids : undefined;
    
    const result = await companyServices.viewUsers("influencer", iso_code, level_id, industry_ids);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error viewing users', error });
  }
}

async function viewBrands(req: Request, res: Response) {
  try {
    const result = await companyServices.viewBrands("brand");
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error viewing users', error });
  }
}


// Adverts CRUD Controller Methods
async function addAdvert(req: Request, res: Response) {
  try {
    const result = await companyServices.addAdvert(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding advert', error });
  }
}

async function getAdverts(req: Request, res: Response) {
  try {
    const result = await companyServices.getAdverts();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching adverts', error });
  }
}

async function getAdvertById(req: Request, res: Response) {
  try {
    const result = await companyServices.getAdvertById(Number(req.params.id));
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching advert', error });
  }
}

async function updateAdvert(req: Request, res: Response) {
  try {
    const result = await companyServices.updateAdvert(Number(req.params.id), req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating advert', error });
  }
}

async function deleteAdvert(req: Request, res: Response) {
  try {
    const result = await companyServices.deleteAdvert(Number(req.params.id));
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting advert', error });
  }
}

// Rate limiting storage (in production, use Redis or database)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const MAX_QUERIES_PER_HOUR = 10;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    // Reset or create new limit
    const newLimit = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitStore.set(userId, newLimit);
    return { allowed: true, remaining: MAX_QUERIES_PER_HOUR - 1, resetTime: newLimit.resetTime };
  }
  
  if (userLimit.count >= MAX_QUERIES_PER_HOUR) {
    return { allowed: false, remaining: 0, resetTime: userLimit.resetTime };
  }
  
  return { allowed: true, remaining: MAX_QUERIES_PER_HOUR - userLimit.count - 1, resetTime: userLimit.resetTime };
}

function incrementRateLimit(userId: string): void {
  const userLimit = rateLimitStore.get(userId);
  if (userLimit) {
    userLimit.count += 1;
    rateLimitStore.set(userId, userLimit);
  }
}

async function runAIQuery(req: Request, res: Response) {
  try {
    const { question } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id || 'anonymous'; // Get user ID from JWT
    
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ 
        message: 'Question is required and must be a string' 
      });
    }

    // Check rate limit
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      const timeUntilReset = Math.ceil((rateCheck.resetTime - Date.now()) / (1000 * 60)); // minutes
      return res.status(429).json({
        success: false,
        message: `Rate limit exceeded. You can make ${MAX_QUERIES_PER_HOUR} queries per hour. Try again in ${timeUntilReset} minutes.`,
        rateLimitInfo: {
          remaining: 0,
          resetTime: rateCheck.resetTime,
          maxQueries: MAX_QUERIES_PER_HOUR
        }
      });
    }

    const gemsAI = new GemsAI();
    const result = await gemsAI.runAIQuery(question);
    
    // Increment rate limit only on successful query
    incrementRateLimit(userId);
    
    res.status(200).json({
      success: true,
      data: result,
      rateLimitInfo: {
        remaining: rateCheck.remaining,
        resetTime: rateCheck.resetTime,
        maxQueries: MAX_QUERIES_PER_HOUR
      }
    });
  } catch (error) {
    console.error('AI Query Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error processing AI query', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

async function runPredefinedQuery(req: Request, res: Response) {
  try {
    const { type } = req.params;
    
    if (!type) {
      return res.status(400).json({ 
        message: 'Query type is required' 
      });
    }

    const gemsAI = new GemsAI();
    const result = await gemsAI.runPredefinedQuery(type);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Predefined Query Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error processing predefined query', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

// Posts management functions
async function getAllPosts(req: Request, res: Response) {
  try {
    const { page = 1, limit = 50, platform, status, search } = req.query;
    const result = await companyServices.getAllPosts({
      page: Number(page),
      limit: Number(limit),
      platform: platform as string,
      status: status as string,
      search: search as string
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching all posts:', error);
    res.status(500).json({ message: 'Error fetching posts', error });
  }
}

async function getReportedPosts(req: Request, res: Response) {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const result = await companyServices.getReportedPosts({
      page: Number(page),
      limit: Number(limit),
      status: status as string
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching reported posts:', error);
    res.status(500).json({ message: 'Error fetching reported posts', error });
  }
}

async function deletePost(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await companyServices.deletePost(id);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ message: 'Error deleting post', error });
  }
}

async function getPostsAnalytics(req: Request, res: Response) {
  try {
    const { period = '30d', platform } = req.query;
    const result = await companyServices.getPostsAnalytics({
      period: period as string,
      platform: platform as string
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching posts analytics:', error);
    res.status(500).json({ message: 'Error fetching posts analytics', error });
  }
}

async function getPostsFilters(req: Request, res: Response) {
  try {
    const result = await companyServices.getPostsFilters();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching posts filters:', error);
    res.status(500).json({ message: 'Error fetching posts filters', error });
  }
}

async function changePassword(req: Request, res: Response) {
  try {
    const result = await companyServices.changePassword(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Error changing password', error });
  }
}

async function forgotPassword(req: Request, res: Response) {
  try {
    const result = await companyServices.forgotPassword(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    console.error('Error processing forgot password:', error);
    res.status(500).json({ message: 'Error processing forgot password', error });
  }
}

async function resetPasswordWithOTP(req: Request, res: Response) {
  try {
    const result = await companyServices.resetPasswordWithOTP(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    console.error('Error resetting password with OTP:', error);
    res.status(500).json({ message: 'Error resetting password', error });
  }
}

// Agent Management Routes
router.get('/agents', applyJWTConditionally, getAgents);
router.get('/agents/:agentId/companies', applyJWTConditionally, getAgentCompanies);
router.get('/agents/me/companies', applyJWTConditionally, getMyAgentCompanies);
router.post('/agents/companies', applyJWTConditionally, addAgentToCompany);
router.delete('/agents/:agentId/companies/:businessId', applyJWTConditionally, removeAgentFromCompany);
router.post('/agents', applyJWTConditionally, createAgent);
router.put('/agents/:agentId', applyJWTConditionally, updateAgent);
router.delete('/agents/:agentId', applyJWTConditionally, deleteAgent);
router.post('/agents/:agentId/reset-password', applyJWTConditionally, resetAgentPassword);
router.get('/companies/available', applyJWTConditionally, getAvailableCompanies);
router.get('/referrals/:userId', applyJWTConditionally, getReferrals);
router.get('/referrals/analytics', applyJWTConditionally, getReferralAnalytics);


async function getAgents(req: Request, res: Response) {
  try {
    const iso_code = typeof req.query.iso_code === 'string' ? req.query.iso_code : undefined;
    const result = await companyServices.getAgents(iso_code);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting agents', error });
  }
}

async function getAgentCompanies(req: Request, res: Response) {
  try {
    const { agentId } = req.params;
    const result = await companyServices.getAgentCompanies(agentId);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting agent companies', error });
  }
}

async function addAgentToCompany(req: Request, res: Response) {
  try {
 
    const result = await companyServices.addAgentToCompany(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding agent to company', error });
  }
}

async function removeAgentFromCompany(req: Request, res: Response) {
  try {
    const { agentId, businessId } = req.params;
    const userId = (req.body as any).userId; // From JWT middleware

    const result = await companyServices.removeAgentFromCompany({ 
      agent_id: agentId, 
      business_id: businessId, 
      userId 
    });
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error removing agent from company', error });
  }
}

async function createAgent(req: Request, res: Response) {
  try {
    const { first_name, last_name, email } = req.body;
    const userId = (req.body as any).userId; // From JWT middleware

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ message: 'first_name, last_name, and email are required' });
    }

    const result = await companyServices.createAgent(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error creating agent', error });
  }
}

async function getMyAgentCompanies(req: Request, res: Response) {
  try {
    // If agent auth is used, map from JWT; for now accept agentId via query
    const agentId = (req.query.agentId as string) || '';
    if (!agentId) {
      return res.status(400).json({ message: 'agentId is required' });
    }
    const result = await companyServices.getAgentCompanies(agentId);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting my agent companies', error });
  }
}

async function getAvailableCompanies(req: Request, res: Response) {
  try {
    const result = await companyServices.getAvailableCompanies();
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting available companies', error });
  }
}

async function updateAgent(req: Request, res: Response) {
  try {
    const { agentId } = req.params;
    const result = await companyServices.updateAgent(agentId, req.body);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating agent', error });
  }
}

async function deleteAgent(req: Request, res: Response) {
  try {
    const { agentId } = req.params;
    const userId = (req.body as any).userId;
    const result = await companyServices.deleteAgent(agentId, userId);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting agent', error });
  }
}

async function resetAgentPassword(req: Request, res: Response) {
  try {
    const { agentId } = req.params;
    const userId = (req.body as any).userId;
    const result = await companyServices.resetAgentPassword(agentId, userId);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error resetting agent password', error });
  }
}

async function getReferrals(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const result = await companyServices.getReferrals(userId);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting referrals', error });
  }
}

async function getReferralAnalytics(req: Request, res: Response) {
  try {
    const result = await companyServices.getReferrals(); // No userId = admin analytics
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting referral analytics', error });
  }
}

export default router;
