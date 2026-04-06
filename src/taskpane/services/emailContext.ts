// Extracts relevant data from the currently selected Outlook item
// Works for both email messages and calendar appointments.

const INTERNAL_DOMAIN = 'extremenetworks.com';

export interface ItemContext {
  type: 'message' | 'appointment';
  subject: string;
  date: string;           // ISO date string YYYY-MM-DD
  body: string;           // plain-text body (async)
  participants: string[]; // all external email addresses
  externalDomains: string[];
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function isInternal(email: string): boolean {
  const domain = extractDomain(email);
  return domain === INTERNAL_DOMAIN || domain === '';
}

function collectEmails(item: Office.MessageRead | Office.AppointmentRead): string[] {
  const emails: string[] = [];

  if (item.itemType === Office.MailboxEnums.ItemType.Message) {
    const msg = item as Office.MessageRead;
    msg.to?.forEach((r) => r.emailAddress && emails.push(r.emailAddress));
    msg.cc?.forEach((r) => r.emailAddress && emails.push(r.emailAddress));
    if ((msg.from as Office.EmailAddressDetails)?.emailAddress) {
      emails.push((msg.from as Office.EmailAddressDetails).emailAddress);
    }
  } else {
    const appt = item as Office.AppointmentRead;
    appt.requiredAttendees?.forEach((r) => r.emailAddress && emails.push(r.emailAddress));
    appt.optionalAttendees?.forEach((r) => r.emailAddress && emails.push(r.emailAddress));
    if ((appt.organizer as Office.EmailAddressDetails)?.emailAddress) {
      emails.push((appt.organizer as Office.EmailAddressDetails).emailAddress);
    }
  }

  return [...new Set(emails.map((e) => e.toLowerCase()))];
}

function getItemDate(item: Office.MessageRead | Office.AppointmentRead): string {
  if (item.itemType === Office.MailboxEnums.ItemType.Appointment) {
    const appt = item as Office.AppointmentRead;
    return formatDate(appt.start ?? new Date());
  }
  // For messages use dateTimeCreated
  const msg = item as Office.MessageRead;
  return formatDate((msg as unknown as { dateTimeCreated: Date }).dateTimeCreated ?? new Date());
}

export function getItemContext(): Promise<ItemContext> {
  return new Promise((resolve, reject) => {
    const item = Office.context.mailbox.item;
    if (!item) return reject(new Error('No item selected'));

    const allEmails = collectEmails(item as Office.MessageRead | Office.AppointmentRead);
    const externalEmails = allEmails.filter((e) => !isInternal(e));
    const externalDomains = [...new Set(externalEmails.map(extractDomain).filter(Boolean))];
    const date = getItemDate(item as Office.MessageRead | Office.AppointmentRead);
    const subject = (item as { subject: string }).subject ?? '';
    const type = item.itemType === Office.MailboxEnums.ItemType.Appointment ? 'appointment' : 'message';

    // Fetch body asynchronously
    item.body.getAsync(Office.CoercionType.Text, { asyncContext: 'body' }, (result) => {
      if (result.status === Office.AsyncResultStatus.Failed) {
        // Non-fatal — proceed without body
        resolve({ type, subject, date, body: '', participants: externalEmails, externalDomains });
      } else {
        resolve({
          type,
          subject,
          date,
          body: result.value ?? '',
          participants: externalEmails,
          externalDomains,
        });
      }
    });
  });
}
