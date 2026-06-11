import {exchangeAutomationEngine} from '../automation/ExchangeAutomationEngine';
import {balanceMonitoringEngine} from '../automation/BalanceMonitoringEngine';
import {automationService} from '../services/AutomationService';
import {subscriptionGuardService} from '../services/SubscriptionGuardService';
import {dashboardService} from '../services/DashboardService';

export const sarifModules = {
  exchangeAutomationEngine,
  balanceMonitoringEngine,
  automationService,
  subscriptionGuardService,
  dashboardService,
};
