import * as cron from 'node-cron';
import Activities from '../models/activities.model';
import Groups from '../models/groups.model';
import DailyMessageGenerator from '../thirdparty/ChatGptAPI';
import Notifications from '../models/notifications.admin.model';
import Model from './model';
import Campaigns from '../models/campaigns.model';
import Wallet from '../models/wallet.model';

class CronService {
    constructor() {
        console.log("Cron Service initiated.");
        console.log("Current server time:", new Date().toLocaleString());
        this.scheduleDailyCacheNews();
        this.scheduleDailySummaryTask();
        this.scheduleCampaignInvitationsClose();
        this.scheduleRepetitiveTasks();
        this.scheduleEveryThirtySeconds();
        this.scheduleExchangeRatesUpdate();
    }


 
    private scheduleCampaignInvitationsClose() {
        cron.schedule('0 */12 * * *', async () => {
            console.log('Running campaign invitations close task every 12 hours...');
            try {
                await new Model().saveCronLg(`CLOSE_CAMPAIGN_INVITATIONS`);
                await new Campaigns().closeExpiredCampaignInvitations();
                console.log('Campaign invitations close task completed.');
            } catch (error) {
                console.error('Error running campaign invitations close task:', error);
            }
        });
    }

    private scheduleRepetitiveTasks() {
        cron.schedule('0 */6 * * *', async () => {
            console.log('Running repetitive tasks duplication every 6 hours...');
            try {
                await new Model().saveCronLg(`REPETITIVE_TASKS_DUPLICATION`);

                // Get all active campaigns and update their repetitive task periods
                const campaigns = await new Campaigns().getActiveCampaignsForRepetitiveTasks();
                if (campaigns && campaigns.data) {
                    for (const campaign of campaigns.data) {
                        try {
                            await new Campaigns().updateRepetitiveTaskPeriods(campaign.campaign_id);
                        } catch (error) {
                            console.error(`Error updating task periods for campaign ${campaign.campaign_id}:`, error);
                        }
                    }
                }

                console.log('Repetitive tasks duplication completed.');
            } catch (error) {
                console.error('Error running repetitive tasks duplication:', error);
            }
        });
    }
    private scheduleEveryThirtySeconds() {
        console.log('supports seconds?', cron.validate('*/30 * * * * *')); // should be true

        console.log("Scheduling every 30 seconds task...");
        cron.schedule('*/30 * * * * *', async () => {
            try {
                await new Model().saveCronLg(`EVERY_30_SECONDS`);
                await new Wallet().pendingReversals();
            } catch (error) {
                console.error('Error running every 30 seconds task:', error);
            }
        });


    }

    private scheduleDailyCacheNews() {
        cron.schedule('0 0 * * *', async () => {
            console.log('Running daily cacheNews task...');
            try {
                new Model().saveCronLg(`CACHE_NEWS`)
                await new Activities().cacheNews();
                console.log('Daily cacheNews task completed.');
            } catch (error) {
                console.error('Error running daily cacheNews task:', error);
            }
        });
    }

    private scheduleDailySummaryTask() {
        cron.schedule('0 6 * * *', async () => {
            console.log('Running daily summary task...');
            try {
                new Model().saveCronLg(`CLOSE_CAMPAIGNS`)
                new Campaigns().closeExpiredCampaigns();
                new Campaigns().payAllCampaigns();

                console.log('Daily summary task completed.');
            } catch (error) {
                console.error('Error running daily summary task:', error);
            }
        });
    }

    private scheduleExchangeRatesUpdate() {
        cron.schedule('0 2 * * *', async () => { 
            console.log('Running daily exchange rates update task...');
            try {
                await new Model().saveCronLg(`UPDATE_EXCHANGE_RATES`);
                const result = await new Wallet().fetchAndUpdateExchangeRates();
                
                if (result.status === 200) {
                    console.log(`✅ Exchange rates updated successfully. ${result.data?.newRates || 0} new rates added.`);
                } else {
                    console.log(`⚠️ Exchange rates update completed with status: ${result.status}`);
                }
                
                console.log('Daily exchange rates update task completed.');
            } catch (error) {
                console.error('Error running daily exchange rates update task:', error);
            }
        });
    }



}

export default CronService;
