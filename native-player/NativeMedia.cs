using System;
using System.IO;
using System.Net;
using System.Text;
using System.Globalization;
using System.Runtime.InteropServices;
namespace VisualNovelNativePlayer {
// MCI uses Windows' installed native media drivers. No browser runtime is involved.
internal sealed class NativeMedia : IDisposable {
 [DllImport("winmm.dll", CharSet=CharSet.Unicode)] static extern int mciSendString(string command,StringBuilder result,int length,IntPtr callback);
 [DllImport("winmm.dll", CharSet=CharSet.Unicode)] static extern bool mciGetErrorString(int error,StringBuilder text,int length);
 const long Limit=64L*1024*1024;
 readonly string alias="vns"+Guid.NewGuid().ToString("N");
 public string DirectoryPath {get;private set;}
 bool opened,loop,paused;
 public NativeMedia(){DirectoryPath=Path.Combine(Path.GetTempPath(),"vns-media-"+Guid.NewGuid().ToString("N"));}
 string Command(string command){var text=new StringBuilder(512);int code=mciSendString(command,text,text.Capacity,IntPtr.Zero);if(code!=0){mciGetErrorString(code,text,text.Capacity);throw new InvalidOperationException("Windows media error (codec/device): "+text+" ["+code+"]");}return text.ToString();}
 public string Mode {get{return opened?Command("status "+alias+" mode"):"closed";}}
 public double Position {get{double n;return opened&&Double.TryParse(Command("status "+alias+" position"),out n)?n:0;}}
 public void Open(string source,bool repeat,IntPtr parent){
  Close();if(String.IsNullOrWhiteSpace(source))return;
  Directory.CreateDirectory(DirectoryPath);string file=Path.Combine(DirectoryPath,"asset.bin");
  try {
   string extension="";
   if(source.StartsWith("data:",StringComparison.OrdinalIgnoreCase)){
    int comma=source.IndexOf(',');if(comma<0||source.Length>Limit*2)throw new InvalidDataException("Windows media data exceeds limit or is malformed");
    string header=source.Substring(0,comma).ToLowerInvariant();
    extension=header.Contains("wav")?".wav":header.Contains("mpeg")?".mp3":header.Contains("mp4")?".mp4":header.Contains("webm")?".webm":header.Contains("ogg")?".ogg":header.Contains("avi")?".avi":".bin";
    byte[] bytes=header.Contains(";base64")?Convert.FromBase64String(source.Substring(comma+1)):Encoding.UTF8.GetBytes(Uri.UnescapeDataString(source.Substring(comma+1)));
    if(bytes.LongLength>Limit)throw new InvalidDataException("Windows media exceeds 64MB limit");file=Path.Combine(DirectoryPath,"asset"+extension);File.WriteAllBytes(file,bytes);
   }else{
    Uri uri;if(!Uri.TryCreate(source,UriKind.Absolute,out uri)||(uri.Scheme!="http"&&uri.Scheme!="https"))throw new InvalidDataException("Windows media requires HTTP(S) or a data URI");
    extension=Path.GetExtension(uri.AbsolutePath);if(extension.Length>8)extension=".bin";file=Path.Combine(DirectoryPath,"asset"+extension);
    var request=(HttpWebRequest)WebRequest.Create(uri);request.Timeout=15000;request.ReadWriteTimeout=15000;
    using(var response=request.GetResponse())using(var input=response.GetResponseStream())using(var output=File.Create(file)){byte[] buffer=new byte[81920];long total=0;int n;while((n=input.Read(buffer,0,buffer.Length))>0){total+=n;if(total>Limit)throw new InvalidDataException("Windows media exceeds 64MB limit");output.Write(buffer,0,n);}}
   }
   Command("open \""+file+"\" type mpegvideo alias "+alias+(parent!=IntPtr.Zero?" style child parent "+parent.ToInt64().ToString(CultureInfo.InvariantCulture):""));opened=true;loop=repeat;paused=false;Command("set "+alias+" time format milliseconds");
  }catch{Close();throw;}
 }
 public void Play(){if(opened){Command("play "+alias);paused=false;}}
 public void Pause(){if(opened&&Mode=="playing"){Command("pause "+alias);paused=true;}}
 public void Resume(){if(opened&&paused)Play();}
 public void SetVolume(double value){if(opened)Command("setaudio "+alias+" volume to "+((int)(Math.Max(0,Math.Min(1,value))*1000)).ToString(CultureInfo.InvariantCulture));}
 public void SetRate(double value){if(opened)Command("set "+alias+" speed "+((int)(value*1000)).ToString(CultureInfo.InvariantCulture));}
 public void Resize(int width,int height){if(opened)Command("put "+alias+" window at 0 0 "+width+" "+height);}
 public void Tick(){if(opened&&loop&&!paused&&Mode=="stopped"){Command("seek "+alias+" to start");Play();}}
 public void Close(){if(opened){try{Command("close "+alias);}finally{opened=false;}}if(Directory.Exists(DirectoryPath))foreach(string f in Directory.GetFiles(DirectoryPath))try{File.Delete(f);}catch(IOException){}}
 public void Dispose(){Close();try{if(Directory.Exists(DirectoryPath))Directory.Delete(DirectoryPath,true);}catch(IOException){}}
}}
