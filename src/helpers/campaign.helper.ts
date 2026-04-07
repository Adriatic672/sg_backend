interface Influencer {
    name: string;
    platforms: { [platform: string]: number }; // Platform names with follower counts
  }
  
  export function calculateWeightedScore(
    influencer: Influencer,
    preferences: { [platform: string]: number }
  ): number {
    let score = 0;
    for (const platform in influencer.platforms) {
      const multiplier = preferences[platform] || 1;
      score += influencer.platforms[platform] * multiplier;
    }
    return score;
  }
  
  