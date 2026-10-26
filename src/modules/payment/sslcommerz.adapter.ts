import axios from 'axios';

const storeId = process.env.SSLCOMMERZ_STORE_ID!;
const storePass = process.env.SSLCOMMERZ_STORE_PASSWORD!;
const isLive = process.env.SSLCOMMERZ_IS_LIVE === 'true';

const baseUrl = isLive
    ? 'https://securepay.sslcommerz.com'
    : 'https://sandbox.sslcommerz.com';

// SSLCommerz payment session initiate logic
export const initSSLCommerzPayment = async (payload: {
    total_amount: number;
    tran_id: string;
    success_url: string;
    fail_url: string;
    cancel_url: string;
    ipn_url: string;
    cus_name: string;
    cus_email: string;
    cus_phone: string;
}) => {
    const data = new URLSearchParams({
        store_id: storeId,
        store_passwd: storePass,
        currency: 'BDT',
        product_category: 'Digital Service',
        shipping_method: 'NO',
        cus_add1: 'Chittagong',
        cus_city: 'Chittagong',
        cus_country: 'Bangladesh',
        ...payload,
        total_amount: payload.total_amount.toString(),
    });

    const response = await axios.post(`${baseUrl}/gwprocess/v4/api.php`, data, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
};

// Official SSLCommerz transaction verification logic
export const validateSSLCommerzPayment = async (val_id: string) => {
    const url = `${baseUrl}/validator/api/validationserverAPI.php?val_id=${val_id}&store_id=${storeId}&store_passwd=${storePass}&v=1&format=json`;
    const response = await axios.get(url);
    return response.data;
};