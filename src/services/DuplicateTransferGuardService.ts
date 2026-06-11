import {transactionRepository} from '../repositories/TransactionRepository';
import {loggingService} from './LoggingService';
import type {AutomationJobDescriptor} from './AutomationLockService';
import {isMoneyTransferJobType, transactionTypeForJobType} from './DuplicateTransferPolicy';

class DuplicateTransferGuardService {
  async findDuplicateForJob(job: AutomationJobDescriptor) {
    if (!isMoneyTransferJobType(job.type) || !Number.isFinite(job.amount)) {
      return undefined;
    }

    const transactionType = transactionTypeForJobType(job.type);
    if (!transactionType) {
      return undefined;
    }

    return transactionRepository.findRecentTransferDuplicate({
      amount: Number(job.amount),
      transactionType,
      destinationAccount: job.destinationAccount,
      reference: job.reference,
      source: job.source,
    });
  }

  async shouldSkipJob(job: AutomationJobDescriptor) {
    const duplicate = await this.findDuplicateForJob(job);
    if (!duplicate) {
      return false;
    }

    if (job.source === 'sms') {
      await loggingService.log(
        'system',
        'Skipped SMS-triggered automation because matching balance-triggered transfer already processed.',
      );
    } else {
      await loggingService.log('system', 'Duplicate event detected');
    }

    await loggingService.log('system', 'Pending event reviewed');
    await loggingService.log('system', 'Duplicate transfer skipped');
    return true;
  }
}

export const duplicateTransferGuardService = new DuplicateTransferGuardService();
