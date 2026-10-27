import axios from 'axios';

const getStoreConfig = () => {
    const isLive = process.env.SSLCOMMERZ_IS_LIVE === 'true';
    return {
        storeId: process.env.SSLCOMMERZ_STORE_ID || 'poste6ade7b12837f4',
        storePass: process.env.SSLCOMMERZ_STORE_PASSWORD || 'poste6ade7b12837f4@ssl',
        baseUrl: isLive ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com',
    };
};

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
    paymentMethod?: string;
}) => {
    const { storeId, storePass, baseUrl } = getStoreConfig();

    let multiCardName = '';
    if (payload.paymentMethod === 'bkash') {
        multiCardName = 'bkash';
    } else if (payload.paymentMethod === 'nagad') {
        multiCardName = 'nagad';
    } else if (payload.paymentMethod === 'cards' || payload.paymentMethod === 'card') {
        multiCardName = 'visacard,mastercard,dbbl_nexus,internetbank';
    }

    const dataParams: Record<string, string> = {
        store_id: storeId,
        store_passwd: storePass,
        currency: 'BDT',
        product_name: 'PosterAI Credits Recharge',
        product_category: 'Digital Service',
        product_profile: 'general',
        shipping_method: 'NO',
        cus_add1: 'Dhaka',
        cus_city: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        tran_id: payload.tran_id,
        success_url: payload.success_url,
        fail_url: payload.fail_url,
        cancel_url: payload.cancel_url,
        ipn_url: payload.ipn_url,
        cus_name: payload.cus_name,
        cus_email: payload.cus_email,
        cus_phone: payload.cus_phone,
        total_amount: payload.total_amount.toString(),
    };

    if (multiCardName) {
        dataParams.multi_card_name = multiCardName;
    }

    const data = new URLSearchParams(dataParams);

    const response = await axios.post(`${baseUrl}/gwprocess/v4/api.php`, data, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
};

// Official SSLCommerz transaction verification logic
export const validateSSLCommerzPayment = async (val_id: string) => {
    const { storeId, storePass, baseUrl } = getStoreConfig();
    const url = `${baseUrl}/validator/api/validationserverAPI.php?val_id=${val_id}&store_id=${storeId}&store_passwd=${storePass}&v=1&format=json`;
    const response = await axios.get(url);
    return response.data;
};