import * as vscode from 'vscode';

/**
 * Orkestrasyon standardinda `workspaceId`, debug-protocol'un
 * StartSessionRequestDto / DebugSessionConfigurationDto alanlarinda tanimli
 * opak bir string'dir. Orkestrator onu yorumlamaz, oldugu gibi saklar ve
 * geri verir.
 *
 * Bu dosya o string'in TEK uretim noktasidir. Daha once iki ayri formul
 * vardi -- DAG tarafi ciplak workspace yolunu, msdebug tarafi
 * `${sessionId}:${yol}` bicimini yaziyordu. Ayni workspace icin iki farkli
 * kimlik uretildigi icin msdebug'in session filtresi DAG session'larini
 * hicbir zaman eslestiremiyor, dolayisiyla DAG breakpoint'leri
 * "Distributed Breakpoints" listesinde gorunmuyordu.
 *
 * Format `${vscode.env.sessionId ilk 12 karakter}:${workspace yolu}` olarak
 * secildi: sessionId VS Code sureci basina benzersizdir, boylece ayni klasoru
 * iki pencerede acmak breakpoint/olay sizmasina yol acmaz.
 */
export function getWorkspaceIdentity(): string {
  return `${vscode.env.sessionId.slice(0, 12)}:${getWorkspacePath()}`;
}

/** Kimligin icindeki ham workspace yolu. Eski kayitlarla eslesmede kullanilir. */
export function getWorkspacePath(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'untitled';
}

/**
 * Bir session/agent kaydinin bu workspace'e ait olup olmadigini soyler.
 *
 * Kayit hic `workspaceId` tasimiyorsa DISLANMAZ: orkestratorde bu alan
 * opsiyoneldir ve onu doldurmayan uretici (eski surum istemci, sidecar,
 * harici arac) olabilir. Sadece kimlik VAR ve FARKLI oldugunda eleriz.
 */
export function belongsToWorkspace(
  candidateWorkspaceId: string | undefined,
  currentWorkspaceId: string | undefined,
): boolean {
  if (!candidateWorkspaceId) { return true; }
  if (!currentWorkspaceId) { return true; }
  if (candidateWorkspaceId === currentWorkspaceId) { return true; }

  // Geriye donuk uyum: DAG tarafi eskiden onek'siz, ciplak workspace yolunu
  // yaziyordu. Bu bicimdeki kayitlar hala orkestratorde duruyor olabilir
  // (surmekte olan bir debug oturumu gibi). Onlari da kabul ediyoruz.
  //
  // Pencere izolasyonu bundan zarar gormez: yalnizca ESKI bicimli kayitlara
  // taniniyor, yeni kayitlarin hepsi onekli kimlik yaziyor.
  return candidateWorkspaceId === getWorkspacePath();
}
