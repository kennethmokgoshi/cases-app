import type { ActionType, StepExecutionResult } from './types';

export interface ActionContext {
  caseId: string;
  planId: string;
  stepId: string;
  actionParams: Record<string, unknown>;
  caseRecord: {
    id: string;
    fileNumber: string;
    clientId: string;
    assignedToId: string | null;
    client: {
      id: string;
      firstName: string;
      lastName: string;
      idNumber: string;
      email: string | null;
      phone: string | null;
      netSalary: unknown;
    };
  };
}

type ActionHandler = (ctx: ActionContext) => Promise<StepExecutionResult>;

class StepRegistry {
  private actions = new Map<ActionType, ActionHandler>();

  register(actionType: ActionType, handler: ActionHandler): void {
    this.actions.set(actionType, handler);
  }

  getAction(actionType: ActionType): ActionHandler {
    const handler = this.actions.get(actionType);
    if (!handler) return async () => ({ success: false, error: `No handler for: ${actionType}` });
    return handler;
  }

  isRegistered(actionType: ActionType): boolean {
    return this.actions.has(actionType);
  }
}

export const stepRegistry = new StepRegistry();

// Register all action handlers
import './actions/cases';
import './actions/legal';
import './actions/insurance';
import './actions/forensic';
import './actions/finance';
import './actions/ghl';
