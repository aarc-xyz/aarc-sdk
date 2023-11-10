import { SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { TaskState } from '@gelatonetwork/relay-sdk/dist/lib/status/types';
import { Logger } from '../utils/Logger';
import { GelatoTxStatusDto, RelayTrxDto } from "../utils/Types";

export const relayTransaction = async (relayTrxDto: RelayTrxDto): Promise<string> => {
    try {
        const { requestData, relayer, gelatoApiKey } = relayTrxDto
        const request: SponsoredCallRequest = requestData
        const relayResponse = await relayer.sponsoredCall(request, gelatoApiKey);
        Logger.log('Relayed transaction info:', relayResponse);
        return relayResponse.taskId
    } catch (error) {
        Logger.error(`Relayed transaction error: ${error}`);
        throw error
    }
}

export const getGelatoTransactionStatus = async (gelatoTxStatusDto: GelatoTxStatusDto): Promise<boolean> => {
    const { relayer, taskId } = gelatoTxStatusDto
    let response = await relayer.getTaskStatus(taskId);
    Logger.log('response ', response);
    while (response != undefined && (response.taskState === TaskState.CheckPending || response.taskState === TaskState.ExecPending)) {
        Logger.log('Transaction is pending');
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = await relayer.getTaskStatus(taskId);
    }
    if (response != undefined && response.taskState === TaskState.WaitingForConfirmation) {
        Logger.log('Transaction is executed successfully, waiting for confirmations');
        Logger.log('Transaction hash: ', response.transactionHash);
        return true;
    } else if (response != undefined && (response.taskState === TaskState.ExecReverted || response.taskState === TaskState.Cancelled)) {
        Logger.log('Transaction failed');
        return false;
    } else if (response != undefined && response.taskState === TaskState.ExecSuccess) {
        Logger.log('Transaction is executed successfully');
        Logger.log('Transaction hash: ', response.transactionHash);
        return true;
    } else {
        return false;
    }
}