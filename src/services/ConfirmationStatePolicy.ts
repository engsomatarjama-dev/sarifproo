import {TransactionStatus} from '../types';

export const canStartAwaitingConfirmation = (status: TransactionStatus) => status !== 'completed';
