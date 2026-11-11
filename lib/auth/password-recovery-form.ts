type PasswordRecoveryResult = {
  error?: string;
  message?: string;
};

export async function submitPasswordRecoveryRequest({
  form,
  isReset,
  body,
  fetcher = fetch,
}: {
  form: Pick<HTMLFormElement, "reset">;
  isReset: boolean;
  body: Record<string, FormDataEntryValue | null | undefined>;
  fetcher?: typeof fetch;
}) {
  const response = await fetcher(`/api/auth/password/${isReset ? "reset" : "forgot"}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as PasswordRecoveryResult;
  if (!response.ok) throw new Error(result.error ?? "Unable to complete this request.");

  form.reset();
  return isReset
    ? "Your password has been reset. Sign in with your new password."
    : result.message ?? "If an account exists, an email is on its way.";
}
