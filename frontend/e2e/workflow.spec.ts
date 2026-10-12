import { expect, Page, test } from '@playwright/test';

const ADMIN = { email: 'admin@taskapp.dev', password: 'Admin@12345' };
const EMPLOYEE = { email: 'priya@taskapp.dev', password: 'Employee@12345' };
const OTHER_EMPLOYEE = { email: 'rahul@taskapp.dev', password: 'Employee@12345' };

async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/** Picks a status from the dropdown and answers the confirmation dialog. */
async function changeStatus(page: Page, option: string, confirmLabel: string, note?: string): Promise<void> {
  await page.getByLabel('Status', { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  if (note) await page.getByLabel(/^(Reason for rejection|Note \(optional\))$/).fill(note);
  await page.getByRole('button', { name: confirmLabel, exact: true }).click();
}

async function expectStatus(page: Page, label: string): Promise<void> {
  await expect(page.getByLabel('Status', { exact: true })).toContainText(label);
}

// Remember the task this run created so it is removed even when an assertion fails midway; the shared dev DB stays clean.
let createdTaskId: string | undefined;

test.afterAll(async ({ browser }) => {
  if (!createdTaskId) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ADMIN);
  const response = await page.request.delete(`/api/v1/tasks/${createdTaskId}`);
  expect(response.ok()).toBeTruthy();
  await context.close();
});

test('a task moves through the full approval workflow with the right people in control', async ({ browser }) => {
  // Two isolated browser contexts = two separate sessions, as a reviewer would use.
  const adminPage = await (await browser.newContext()).newPage();
  const employeePage = await (await browser.newContext()).newPage();
  const otherPage = await (await browser.newContext()).newPage();
  const title = `E2E task ${Date.now()}`;

  await test.step('admin creates and assigns a task', async () => {
    await signIn(adminPage, ADMIN);
    await adminPage.getByRole('link', { name: 'Tasks' }).first().click();
    await adminPage.getByRole('button', { name: 'New task' }).first().click();
    await adminPage.getByLabel('Title').fill(title);
    await adminPage.getByLabel('Description').fill('Created by the Playwright smoke test.');
    await adminPage.getByLabel('Due date').fill('2030-12-31');
    await adminPage.getByLabel('Assignee').click();
    await adminPage.getByRole('option', { name: 'Priya Sharma' }).click();
    await adminPage.getByRole('button', { name: 'Create task' }).click();
    await expect(adminPage.getByText('Task created')).toBeVisible();
    await adminPage.getByRole('link', { name: title }).click();
    await expectStatus(adminPage, 'Pending');
    await expect(adminPage.getByLabel('Status', { exact: true })).toBeDisabled(); // only the assignee can start it
  });

  const taskUrl = adminPage.url();
  const taskId = taskUrl.split('/').pop();
  createdTaskId = taskId;

  await test.step('employee starts the task, cancelling once first', async () => {
    await signIn(employeePage, EMPLOYEE);
    await employeePage.goto(taskUrl);
    await expectStatus(employeePage, 'Pending');

    await employeePage.getByLabel('Status', { exact: true }).click();
    await employeePage.getByRole('option', { name: 'In Progress', exact: true }).click();
    await employeePage.getByRole('button', { name: 'Cancel' }).click();
    await expectStatus(employeePage, 'Pending'); // cancel changed nothing

    await changeStatus(employeePage, 'In Progress', 'Start');
    await expectStatus(employeePage, 'In Progress');
  });

  await test.step('employee submits for approval and cannot approve', async () => {
    await changeStatus(employeePage, 'Pending Approval', 'Submit');
    await expectStatus(employeePage, 'Pending Approval');
    await expect(employeePage.getByLabel('Status', { exact: true })).toBeDisabled();
    const forbidden = await employeePage.request.post(`/api/v1/tasks/${taskId}/transition`, { data: { to: 'COMPLETED' } });
    expect(forbidden.status()).toBe(403);
  });

  await test.step('admin rejects with a reason, employee sees it and resubmits', async () => {
    await adminPage.reload();
    await expectStatus(adminPage, 'Pending Approval');
    await changeStatus(adminPage, 'In Progress', 'Reject', 'Please add the missing figures');
    await expectStatus(adminPage, 'In Progress');

    await employeePage.reload();
    await expectStatus(employeePage, 'In Progress');
    await employeePage.getByRole('tab', { name: 'History' }).click();
    await expect(employeePage.getByText('Please add the missing figures')).toBeVisible();

    await changeStatus(employeePage, 'Pending Approval', 'Submit');
  });

  await test.step('admin approves and the result persists across a reload', async () => {
    await adminPage.reload();
    await changeStatus(adminPage, 'Completed', 'Approve');
    await expectStatus(adminPage, 'Completed');
    await adminPage.reload();
    await expectStatus(adminPage, 'Completed');
    await employeePage.reload();
    await expectStatus(employeePage, 'Completed');
  });

  await test.step('role restrictions hold for the UI and the API', async () => {
    await signIn(otherPage, OTHER_EMPLOYEE);
    await otherPage.goto(taskUrl);
    await expect(otherPage.getByRole('main').getByText('Task not found')).toBeVisible();

    await employeePage.goto('/users');
    await expect(employeePage.getByText('Admins only')).toBeVisible();
    expect((await employeePage.request.get('/api/v1/users')).status()).toBe(403);
  });
});
