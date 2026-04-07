import Model from "../helpers/model";

class Reports extends Model {
  constructor() {
    super();
  }


  async getPayouts() {
    const transactions = await this.callQuerySafe(`SELECT t.*,u.username FROM wl_transactions t inner join users_profile u on t.user_id=u.user_id WHERE t.payment_method='WALLET' AND  order by t.id desc limit 50`);
    return transactions;

  }
  async BrandPayouts(userId:string) {
    const query = `
      SELECT 
        MONTH(created_on) AS month_number,
        SUM(amount_spent) AS total_payout
      FROM campaign_payments
      WHERE created_by='${userId}' AND  YEAR(created_on) = YEAR(CURDATE())
      GROUP BY month_number
      ORDER BY month_number;
    `;
  
    const results: any = await this.callQuerySafe(query);
  
    // Month labels
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const payouts = new Array(12).fill(0); // Initialize all months to 0
  
    // Fill in values from DB result
    results.forEach((row: { month_number: number; total_payout: string; }) => {
      const index = row.month_number - 1; // Month index (0-based)
      payouts[index] = parseFloat(row.total_payout);
    });
  
    return {
      months: monthLabels,
      payouts
    };
  }
  
 
  async homeDashboard() {
    // Retrieve user data from the database.
    const users: any = await this.callQuerySafe(`SELECT user_type, created_at FROM users`);
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 29);
    const days: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      days.push(d.toLocaleDateString("en-US", { month: 'short', day: 'numeric' }));
    }
    const brandsCounts = new Array(30).fill(0);
    const influencersCounts = new Array(30).fill(0);
    // Process each user record and increment counts based on the created_at date and user type.
    users.forEach((user: { user_type: string; created_at: string }) => {
      const creationDate = new Date(user.created_at);

      // If the creation date is within the last 30 days range
      if (creationDate >= startDate && creationDate <= today) {
        // Calculate the index (difference in days) between the creation date and startDate.
        const diffTime = creationDate.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        const userType = user.user_type.toLowerCase();
        if (userType === "brand") {
          brandsCounts[diffDays]++;
        } else if (userType === "influencer") {
          influencersCounts[diffDays]++;
        }
      }
    });

    // Build the response object with day labels and counts
    const response = {
      days,
      brands: brandsCounts,
      influencers: influencersCounts
    };

    return response;
  }
}

export default Reports;
