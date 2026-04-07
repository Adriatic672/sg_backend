import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { contentModeration } from '../interfaces/dynamodb.interfaces';

export default class FlagHelper {
    private axiosInstance = axios.create({
        baseURL: process.env.FLAG_URL,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.FLAG_API_KEY}`
        }
    });

    public async get(url: string, params?: any): Promise<AxiosResponse<any>> {
        return this.axiosInstance.get(url, { params });
    }

    public async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
        return this.axiosInstance.post(url, data, config);
    }

    async detectContent(text: string, threshold: number = 0.3): Promise<any> {
        try {
            const response = await this.post('', { text, threshold });
            console.log('detectContent', response.data);
            const result: any = response.data;
            const contentModeration: contentModeration = {
                flagged: result.flagged,
                prediction: {
                    code: result.prediction.code,
                    description: result.prediction.description,
                    label: result.prediction.label,
                    probability: result.prediction.probability
                }

            };
            return contentModeration;
        } catch (error) {
            console.error('Error in detectContent:', error);
            return null
        }
    }

    async detectImage(file_url: string,mode:string='image', threshold: number = 0.3): Promise<any> {
        try {
            console.log('detectImage', file_url);
            const response = await this.post('', { file_url });
            console.log('detectImage', response.data);
            console.log('detectContent', response.data);
            const result: any = response.data;
            const contentModeration: contentModeration = {
                flagged: result.flagged,
                prediction: {
                    code: result.code,
                    description: result.description,
                    label: result.label,
                    probability: result.probability
                }

            };
            return contentModeration;
        } catch (error) {
            return []
        }
    }

}