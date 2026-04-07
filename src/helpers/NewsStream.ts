import { ActivityNews } from "../interfaces/dynamodb.interfaces";
import { get } from "./httpRequest";
import { createItem, getItemById } from "./dynamodb.helper"; // Assume getItem retrieves items from DynamoDB
import crypto from 'crypto';

class NewsStream {
    private url: string;
    private apiKey: string;
    private cacheDuration: number; // Cache duration in seconds

    constructor() {
        this.url = process.env.NEWS_URL || 'https://newsapi.org/v2/top-headlines';
        this.apiKey = process.env.NEWS_API || '';
        this.cacheDuration = 24 * 60 * 60; // Cache for 24 hours (in seconds)

        if (!this.apiKey) {
            console.warn("Warning: Missing News API key in environment variables.");
        }
    }

    async getNews(country: string, category: string) {
        if (!this.apiKey) {
            throw new Error("News API key is missing. Please set NEWS_API in environment variables.");
        }

        const cacheKey = `${country}-${category}`;
        const cachedArticles = await this.checkCache(cacheKey);

        if (cachedArticles) {
            console.log("Serving news from cache.");
            return this.makeResponse(200, "Success (cached)", cachedArticles);
        }

        console.log("Fetching news from API...");
        const fullUrl = `${this.url}?country=${country}&category=${category}&apiKey=${this.apiKey}`;
        
        try {
            const response = await get(fullUrl);
            const articles = response.articles;

            if (!articles || articles.length === 0) {
                console.log("No articles found.");
                return this.makeResponse(404, "No news articles found.");
            }

            // Save articles to DynamoDB and cache them
            const savedArticles = [];
            for (const article of articles) {
                const newsItem: ActivityNews = {
                    news_id: this.generateUniqueId(article.title, article.url),
                    source: {
                        name: article.source.name,
                        id: article.source.id || '',
                    },
                    country: country,
                    category: category,
                    author: article.author || null,
                    title: article.title,
                    description: article.description || null,
                    news_url: article.url,
                    image_url: article.urlToImage || null,
                    published_at: article.publishedAt,
                    content: article.content || null,
                    status: "approved",
                    created_by: "system", // Assuming system is the creator;
 
                    ttl: Math.floor(Date.now() / 1000) + this.cacheDuration
                };

                await createItem<ActivityNews>("ActivityNews", "news_id", newsItem);
                savedArticles.push(newsItem);
                console.log(`Saved article: ${article.title}`);
            }

            console.log("All news articles saved successfully.");
            return this.makeResponse(200, "Success", savedArticles);
        } catch (error) {
            console.error("Error fetching or saving news data:", error);
            throw error;
        }
    }

    // Check cache in DynamoDB
    private async checkCache(cacheKey: string) {
        try {
            const cachedItems = await getItemById<ActivityNews>("ActivityNews", "news_id",cacheKey);
            if (cachedItems) {
                return cachedItems;
            }
            return null;
        } catch (error) {
            console.error("Error checking cache:", error);
            return null;
        }
    }

    // Generates a unique hash based on the article title and URL
    private generateUniqueId(title: string, url: string): string {
        const hash = crypto.createHash('sha256');
        hash.update(title + url); // Use both title and URL to ensure uniqueness
        return hash.digest('hex');
    }

    private makeResponse(statusCode: number, message: string, data?: any) {
        return { statusCode, message, data };
    }
}

export default new NewsStream();
