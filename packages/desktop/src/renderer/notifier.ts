/**
 * How the app tells the partner something or asks them to confirm. Every pop-up
 * goes through one, so they all look and behave the same; screens take it as a
 * dependency rather than calling the browser.
 */
export interface Notifier {
  /** Confirm that something the partner asked for worked. */
  success(message: string): void;
  /** Report a failure, for a control that has no message area of its own. */
  failure(message: string): void;
  /** Ask the partner to confirm an action; true when they agree. */
  confirm(question: string): boolean;
}

/** The computer's own pop-ups, which partners already recognise. */
export const systemNotifier: Notifier = {
  success: (message: string): void => window.alert(message),
  failure: (message: string): void => window.alert(message),
  confirm: (question: string): boolean => window.confirm(question),
};
