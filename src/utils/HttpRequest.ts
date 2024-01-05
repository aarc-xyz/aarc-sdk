import { Logger } from './Logger';

export enum HttpMethod {
  GET = 'get',
  POST = 'post',
  DELETE = 'delete',
}

/* eslint-disable  @typescript-eslint/no-explicit-any */
interface HttpRequest {
  url: string;
  method: HttpMethod;
  body?: Record<string, any>;
  headers?: object;
}

interface JsonResponse {
  result?: any;
  error?: string | { code?: number; message?: string; handleOpsCallData?: any };
  message?: string;
  msg?: string;
}

export async function sendRequest<T>({
  url,
  method,
  body,
  headers = {},
}: HttpRequest): Promise<T> {
  const serializedData = JSON.stringify(body, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString(); // Convert BigInt to string
    }
    return value;
  });
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: serializedData,
  });

  let jsonResponse: JsonResponse | undefined;
  try {
    jsonResponse = (await response.json()) as JsonResponse;
  } catch (error) {
    if (!response.ok) {
      throw new Error(response.statusText);
    }
  }

  if (!jsonResponse) {
    // Handle the case where jsonResponse is undefined
    throw new Error('No response received.');
  }

  Logger.log('jsonRpc response ', jsonResponse);

  if (response.ok) {
    if (
      jsonResponse &&
      Object.prototype.hasOwnProperty.call(jsonResponse, 'data')
    ) {
      return jsonResponse as T;
    }
    // else
  }
  const errorObject = {
    code: response.status,
    message: response.statusText,
    data: undefined,
  };

  if (jsonResponse?.error) {
    if (typeof jsonResponse.error === 'string') {
      const error = jsonResponse.error;
      errorObject.code = response.status;
      errorObject.message = error;
      delete errorObject.data;
      throw errorObject;
    } else if (typeof jsonResponse.error === 'object') {
      const error = jsonResponse.error;
      errorObject.code = error?.code || 0;
      errorObject.message = error?.message || 'Unknown Error';
      errorObject.data = error?.handleOpsCallData;
      throw errorObject;
    }
  }
  if (jsonResponse?.message) {
    errorObject.message = jsonResponse.message;
    throw errorObject;
  }
  if (jsonResponse?.msg) {
    errorObject.message = jsonResponse.msg;
    throw errorObject;
  }

  throw new Error('Unknown Error: Api call ');
}
