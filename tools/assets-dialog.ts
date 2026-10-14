/**
 * The asset downloader's whole user interface: a native "choose a folder"
 * dialog before it starts and a native message when it ends.
 *
 * The packaged downloader is double-clicked by people who never open a
 * terminal -- on Linux a double-clicked binary may not get one at all -- so
 * the two things they must see go through the platform's own dialogs:
 * PowerShell's WinForms on Windows, AppleScript on macOS, and zenity or
 * kdialog on Linux. Each is part of a stock desktop, so the executable ships
 * no GUI toolkit. When none answers, the caller falls back to the terminal.
 */
import { spawn } from "node:child_process";

export type FolderChoice =
  | { kind: "chosen"; path: string }
  | { kind: "cancelled" }
  | { kind: "unavailable" };

interface RunResult {
  code: number | null;
  stdout: string;
}

/** Runs a dialog program; `null` when the program is not installed. */
function run(
  command: string,
  args: readonly string[],
): Promise<RunResult | null> {
  return new Promise((resolve) => {
    let stdout = "";
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.on("error", () => {
      resolve(null);
    });
    child.on("close", (code) => {
      resolve({ code, stdout });
    });
  });
}

const powershellString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const appleScriptString = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function powershell(script: string): Promise<RunResult | null> {
  return run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    // UTF-8 out, so a folder name outside the console code page survives.
    `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${script}`,
  ]);
}

function chosen(result: RunResult | null): FolderChoice {
  if (!result) return { kind: "unavailable" };
  const path = result.stdout.replace(/[\r\n]+$/, "");
  return result.code === 0 && path
    ? { kind: "chosen", path }
    : { kind: "cancelled" };
}

/** Without a display a dialog program fails, which would read as a cancel. */
const hasLinuxDisplay = () =>
  Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

export async function chooseFolder(
  prompt: string,
  startIn: string,
): Promise<FolderChoice> {
  if (process.platform === "win32") {
    return chosen(
      await powershell(
        [
          "Add-Type -AssemblyName System.Windows.Forms",
          "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
          `$dialog.Description = ${powershellString(prompt)}`,
          "$dialog.ShowNewFolderButton = $true",
          `$dialog.SelectedPath = ${powershellString(startIn)}`,
          // An owner that is topmost, or the dialog opens behind the console.
          "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }",
          "if ($dialog.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($dialog.SelectedPath) } else { exit 1 }",
        ].join("; "),
      ),
    );
  }
  if (process.platform === "darwin") {
    return chosen(
      await run("osascript", [
        "-e",
        `POSIX path of (choose folder with prompt ${appleScriptString(prompt)} default location (POSIX file ${appleScriptString(startIn)}))`,
      ]),
    );
  }
  if (!hasLinuxDisplay()) return { kind: "unavailable" };
  const zenity = await run("zenity", [
    "--file-selection",
    "--directory",
    `--title=${prompt}`,
    `--filename=${startIn.replace(/\/?$/, "/")}`,
  ]);
  if (zenity) return chosen(zenity);
  return chosen(
    await run("kdialog", [
      "--getexistingdirectory",
      startIn,
      "--title",
      prompt,
    ]),
  );
}

/** Shows `text` in a native message box; resolves once it is dismissed. */
export async function showMessage(
  title: string,
  text: string,
  isError = false,
): Promise<void> {
  if (process.platform === "win32") {
    await powershell(
      [
        "Add-Type -AssemblyName System.Windows.Forms",
        `[void][System.Windows.Forms.MessageBox]::Show(${powershellString(text)}, ${powershellString(title)}, 'OK', '${isError ? "Error" : "Information"}')`,
      ].join("; "),
    );
    return;
  }
  if (process.platform === "darwin") {
    await run("osascript", [
      "-e",
      `display dialog ${appleScriptString(text)} with title ${appleScriptString(title)} buttons {"OK"} default button "OK"${isError ? " with icon stop" : ""}`,
    ]);
    return;
  }
  if (!hasLinuxDisplay()) return;
  const zenity = await run("zenity", [
    isError ? "--error" : "--info",
    `--title=${title}`,
    `--text=${text}`,
    "--no-markup",
  ]);
  if (zenity) return;
  await run("kdialog", [
    isError ? "--error" : "--msgbox",
    text,
    "--title",
    title,
  ]);
}
