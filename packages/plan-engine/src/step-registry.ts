import type { ActionType, StepExecutionResult } from './types';
import { casesActions } from './actions/cases';
import { legalActions } from './actions/legal';
import { insuranceActions } from './actions/insurance';
import { forensicActions } from './actions/forensic';
import { financeActions } from './actions/finance';
import { ghlActions } from './actions/ghl';

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

export type ActionHandler = (ctx: ActionContext) => Promise<StepExecutionResult>;

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

  registeredActionTypes(): ActionType[] {
    return [...this.actions.keys()];
  }
}

export const stepRegistry = new StepRegistry();

// Explicit registration of every department's handlers. The action modules export
// plain maps (instead of self-registering via side-effect imports) because this
// package is marked "sideEffects": false — bundlers are free to drop side-effect-only
// imports, which previously shipped an empty registry and failed every step with
// "No handler for: <actionType>".
for (const actionMap of [casesActions, legalActions, insuranceActions, forensicActions, financeActions, ghlActions]) {
  for (const [actionType, handler] of actionMap) {
    stepRegistry.register(actionType, handler);
  }
}
