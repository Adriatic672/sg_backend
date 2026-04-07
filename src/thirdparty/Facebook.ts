  import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';

export default class FacebookAPI {
  getUserPosts(username: string) {
    return {
      data: [],
      follower_count: 0
    }
  }
  static async OAuth2(token: any, userId: any) {
    return false
  }
  private axiosInstance = axios.create({
    baseURL: 'https://facebook-scraper3.p.rapidapi.com',
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'facebook-scraper3.p.rapidapi.com'
    }
  });

  public async get(url: string, params?: any): Promise<AxiosResponse<any>> {
    return this.axiosInstance.get(url, { params });
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this.axiosInstance.post(url, data, config);
  }

  /**
   * Fetch follower count from a Facebook page.
   * @param pageUrl Full Facebook page URL (e.g. https://facebook.com/facebook)
   */
  public async getFollowers(page: string): Promise<number> {
    try {
      const pageUrl = page.startsWith('http') ? page : `https://facebook.com/${page}`;
      console.log('getFourl)', pageUrl);
      const response = await this.get('/page/details', { url: pageUrl });
      console.log('getFourl2', response.data.results);
      const count = response.data?.results.followers || 0;
      return count;
    } catch (error) {
      console.error("Error fetching followers from Facebook:", error);
      return 0;
    }
  }

  /**
   * Fetch a Facebook post by ID.
   * @param postId The ID of the Facebook post
   */
  public async getPost(postId: string): Promise<any> {
    try {
      const response = await this.get('/post', { post_id: postId });
      console.log('getPost-x (Facebook)', response.data);
      return response.data?.results;
    } catch (error) {
      console.error("Error fetching post from Facebook:", error);
      return null;
    }
  }

  /**
   * Verify if the given user appears in the post content (e.g., message or author name).
   * @param username Facebook username to look for
   * @param postId Facebook post ID
   * @param searchText Optional text to search in the post
   */



  async classifyFacebookUrl(url: string) {
    if (/^https:\/\/(www\.)?facebook\.com\/share\/p\/[a-zA-Z0-9]+\/?$/.test(url)) {
      return 'share';
    }

    if (/^https:\/\/(www\.)?facebook\.com\/[^\/]+\/posts\/\d+/.test(url) ||
      /^https:\/\/(www\.)?facebook\.com\/story\.php\?/.test(url)) {
      return 'post';
    }

    return 'unknown';
  }

  async resolveFacebookLink(url: string){
    const type = await this.classifyFacebookUrl(url);

    if (type == 'share') {
      try {
        const response = await axios.get(url, {
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
          headers: {
            'User-Agent': 'Mozilla/5.0', // helps with mobile redirects
          },
        });

        console.log('resolveFacebookLink-x (Facebook)', response.data);
        const redirectedUrl = response.headers.location;
        return redirectedUrl || url;
      } catch (error: any) {
        if (error.response && error.response.status >= 300 && error.response.status < 400) {
          return error.response.headers.location || url;
        }
        console.error('Failed to follow redirect:', error.message);
        return url;
      }
    }

    // If not a share link, return as-is
    return url;
  }

  async extractFacebookPostId(url: string) {
    try {
      const urlObj = new URL(url);
  
      // Case 1: /username/posts/post_id
      const pathMatch = urlObj.pathname.match(/\/[^\/]+\/posts\/(\d+)/);
      if (pathMatch) return pathMatch[1];
  
      // Case 2: story.php?story_fbid=POST_ID
      const storyFbid = urlObj.searchParams.get('story_fbid');
      if (storyFbid) return storyFbid;
  
      // Case 3: permalink.php?story_fbid=POST_ID
      const permalinkFbid = urlObj.pathname.includes('/permalink.php') ? urlObj.searchParams.get('story_fbid') : null;
      if (permalinkFbid) return permalinkFbid;
  
      return null;
    } catch (err) {
      return null;
    }
  }

  
  public async verifyPost(username: string, link: string, searchText: string): Promise<boolean> {
    try {

      const postIdFromUrl = await this.resolveFacebookLink(link);
      if (!postIdFromUrl) {
        console.error('Invalid Facebook post URL');
        return false;
      }
      const postId = await this.extractFacebookPostId(postIdFromUrl);
      if (!postId) {
        console.error('Invalid Facebook post ID');
        return false;
      }
      console.log('verifyPost-x (Facebook) postId:', postId);
      const resolvedUrl = await this.resolveFacebookLink(postId);

      const response = await this.get('/post', { post_id: postId });
      const post = response.data;
      console.log('verifyPost-x (Facebook)', post);

      if (!post) return false;

      const isAuthor = post.author?.name?.toLowerCase() === username.toLowerCase();
      const isTextMatch = searchText
        ? (post.message?.toLowerCase() || '').includes(searchText.toLowerCase())
        : true;

      return isAuthor && isTextMatch;
    } catch (error) {
      console.error('Error verifying Facebook post:', error);
      return false;
    }
  }
}
