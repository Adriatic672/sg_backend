import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

function setHeaders() {
    return {
        'Content-Type': 'application/json',
    };
}

export async function get(url: string) {
    const headers = setHeaders();
    try {
        const response = await axios.get(url, {
            headers: headers,
        });
        const rsp =  response.data;
        console.log("FETCH==>", rsp);
        return rsp;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export async function post( url: string,data: any) {
    console.log("POSTREQUEST==>", data);
    const headers = setHeaders();
    try {
        const response = await axios.post(url, data, {
            headers: headers,
        });
        const rsp =  response.data;
        console.log("RESPONSE==>", rsp);
        return rsp;

    } catch (error) {
        console.error(error);
        throw error;
    }
}
