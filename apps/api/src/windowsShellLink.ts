// WScript.Shell uses ANSI for paths on some Windows installations. Use the
// native Unicode Shell Link interface so Vietnamese installation names survive.
export const shopShellLinkPowerShell=String.raw`
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
[ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShopShellLinkW {
 void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder p, int n, IntPtr data, uint flags);
 void GetIDList(out IntPtr p);
 void SetIDList(IntPtr p);
 void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder p, int n);
 void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string p);
 void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder p, int n);
 void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string p);
 void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder p, int n);
 void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string p);
 void GetHotkey(out short key);
 void SetHotkey(short key);
 void GetShowCmd(out int cmd);
 void SetShowCmd(int cmd);
 void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder p, int n, out int index);
 void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string p, int index);
 void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string p, uint reserved);
 void Resolve(IntPtr hwnd, uint flags);
 void SetPath([MarshalAs(UnmanagedType.LPWStr)] string p);
}
public class ShopShellLinkInfo {
 public string TargetPath;
 public string IconLocation;
 public string WorkingDirectory;
 public string Arguments;
}
public static class ShopShellLink {
 static object Create() { return Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046"))); }
 public static ShopShellLinkInfo Read(string file) {
  object obj=Create();
  try {
   ((IPersistFile)obj).Load(file,0);
   var link=(IShopShellLinkW)obj;
   var target=new StringBuilder(32768);var icon=new StringBuilder(32768);var working=new StringBuilder(32768);var args=new StringBuilder(32768);int index;
   link.GetPath(target,target.Capacity,IntPtr.Zero,4);link.GetIconLocation(icon,icon.Capacity,out index);
   link.GetWorkingDirectory(working,working.Capacity);link.GetArguments(args,args.Capacity);
   return new ShopShellLinkInfo {TargetPath=target.ToString(),IconLocation=icon.ToString()+","+index,WorkingDirectory=working.ToString(),Arguments=args.ToString()};
  } finally {Marshal.FinalReleaseComObject(obj);}
 }
 public static void Write(string file,string target,string icon,int index,string working,string description) {
  object obj=Create();
  try {
   if(File.Exists(file))((IPersistFile)obj).Load(file,0);
   var link=(IShopShellLinkW)obj;
   link.SetPath(target);link.SetIconLocation(icon,index);link.SetWorkingDirectory(working);link.SetArguments("");link.SetDescription(description);
   ((IPersistFile)obj).Save(file,true);
  } finally {Marshal.FinalReleaseComObject(obj);}
 }
 public static void SetIcon(string file,string icon,int index) {
  object obj=Create();
  try {((IPersistFile)obj).Load(file,0);((IShopShellLinkW)obj).SetIconLocation(icon,index);((IPersistFile)obj).Save(file,true);}
  finally {Marshal.FinalReleaseComObject(obj);}
 }
}
'@
`
