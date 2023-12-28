import { BalancesResponse, PriceResponse } from "../utils/AarcTypes";
import { BALANCES_ENDPOINT, PRICE_ENDPOINT } from "../utils/Constants";
import { sendRequest, HttpMethod } from "../utils/HttpRequest";
import { Logger } from "../utils/Logger";

  /**
   * @description this function will return balances of ERC-20, ERC-721 and native tokens
   * @param balancesDto
   * @returns
   */
export const fetchBalances = async (
    apiKey: string, 
    chainId:number, 
    eoaAddress: string,
    fetchBalancesOnly: boolean = true,
    tokenAddresses ?: string[],
): Promise < BalancesResponse > => {
    try {
        // Make the API call using the sendRequest function
        const response: BalancesResponse = await sendRequest({
            url: BALANCES_ENDPOINT,
            method: HttpMethod.POST,
            headers: {
                'x-api-key': apiKey,
            },
            body: {
                chainId: String(chainId),
                address: eoaAddress,
                onlyBalances: fetchBalancesOnly,
                tokenAddresses: tokenAddresses,
            },
        });

        Logger.log('Fetching API Response:', response);
        return response;
    } catch(error) {
        // Handle any errors that may occur during the API request
        Logger.error('Error making backend API call:', error);
        throw error;
    }
}


export const fetchNativeToUsdPrice = async (chainId: number): Promise < PriceResponse > => {
    try {
        // Make the API call using the sendRequest function
        const response: PriceResponse = await sendRequest({
            url: PRICE_ENDPOINT + '/' + chainId,
            method: HttpMethod.GET
        });

        Logger.log(' Price Endpoint Response :', response);
        return response
    } catch(error) {
        // Handle any errors that may occur during the API request
        Logger.error(' Error Making Price Request :', error);
        throw error;
    }
}