'use strict';
const form = document.querySelector('#survey-form');
const button = document.querySelector('#submit-survey');
const connection = document.querySelector('#connection');
const error = document.querySelector('#survey-error');
const responseId = crypto.randomUUID();
let pendingPayload;
async function checkConnection() {
  if (location.protocol === 'file:') {
    connection.textContent =
      'Design preview. Responses are not being collected here. Open this page through the local collection server to submit.';
    return;
  }
  try {
    const response = await fetch('/api/survey/status', { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    if (
      !response.ok ||
      data.version !== 'needs-v1' ||
      !['local', 'cloudflare'].includes(data.storage)
    )
      throw new Error();
    connection.textContent =
      data.storage === 'local'
        ? 'Local research collection is available. Your answers are saved on this computer only when you submit.'
        : 'Responses are collected securely for this project. Your answers are sent only when you submit.';
    button.disabled = false;
  } catch {
    connection.textContent =
      'Response collection is unavailable. Nothing has been sent. Please try again later.';
  }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  if (!form.reportValidity()) return;
  if (!pendingPayload) {
    const data = new FormData(form);
    const obstacles = data.getAll('obstacles');
    if (
      obstacles.length > 1 &&
      obstacles.some((x) => ['Nothing made it difficult', 'Not sure / no recent task'].includes(x))
    ) {
      error.textContent =
        'Choose “Nothing made it difficult” or “Not sure / no recent task” on its own, or select the difficulties you experienced.';
      document.querySelector('[name="obstacles"]').focus();
      return;
    }
    pendingPayload = {
      id: responseId,
      version: 'needs-v1',
      consent: data.has('consent'),
      answers: Object.fromEntries(
        [...data].filter(([key]) => !['consent', 'obstacles'].includes(key)),
      ),
    };
    pendingPayload.answers.obstacles = obstacles;
  }
  button.disabled = true;
  button.textContent = 'Saving your answers…';
  // Freeze the response during retries so an uncertain network result cannot create a second answer.
  form.querySelectorAll('input,textarea').forEach((el) => (el.disabled = true));
  try {
    const response = await fetch('/api/survey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingPayload),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok || data.saved !== true || data.id !== responseId) throw new Error();
    form.hidden = true;
    connection.hidden = true;
    const success = document.querySelector('#survey-success');
    success.hidden = false;
    success.focus();
  } catch {
    error.textContent =
      'We could not confirm that your answers were saved. Your answers are still here. Retry to check and save this same response without duplicating it.';
    button.textContent = 'Retry saving my answers';
    button.disabled = false;
  }
});
checkConnection();
