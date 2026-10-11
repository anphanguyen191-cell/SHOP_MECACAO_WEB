Option Explicit
Dim shell, fso, root, shortcut, code, command, q, logPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")
On Error Resume Next
Set shortcut = shell.CreateShortcut(shell.SpecialFolders("Desktop") & "\Shop Me CaCao.lnk")
shortcut.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
shortcut.Arguments = """" & WScript.ScriptFullName & """"
shortcut.WorkingDirectory = root
shortcut.IconLocation = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\shell32.dll,14")
shortcut.Description = "Shop Me CaCao - mo ung dung"
shortcut.Save
On Error GoTo 0
logPath = root & "\data\launcher-" & fso.GetTempName
q = Chr(34)
command = "cmd.exe /d /c " & q & "node " & q & root & "\scripts\open-shop.mjs" & q & " > " & q & logPath & q & " 2>&1" & q
code = shell.Run(command, 0, True)
If code <> 0 Then
 fso.CopyFile logPath, root & "\data\launcher.log", True
 MsgBox "Khong mo duoc Shop Me CaCao. Kiem tra Node.js 22.13+ / 24 va xem data\launcher.log. Co the chay START_SHOP.bat de xem loi.", 48, "Shop Me CaCao"
End If
On Error Resume Next
fso.DeleteFile logPath, True
