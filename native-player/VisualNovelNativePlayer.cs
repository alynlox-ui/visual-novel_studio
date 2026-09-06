using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Visual Novel Native Player")]
[assembly: AssemblyDescription("Native Windows player exported by Visual Novel Studio")]
[assembly: AssemblyCompany("Visual Novel Studio")]
[assembly: AssemblyProduct("Visual Novel Native Player")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace VisualNovelNativePlayer
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                Payload payload = PayloadReader.Read(Application.ExecutablePath);
                string conditionTest = FindArgument(args, "--condition-self-test=");
                if (!String.IsNullOrEmpty(conditionTest))
                {
                    WriteConditionSelfTest(conditionTest, payload.Project);
                    return 0;
                }
                string selfTest = FindArgument(args, "--self-test=");
                if (!String.IsNullOrEmpty(selfTest))
                {
                    WriteSelfTest(selfTest, payload.Project);
                    return 0;
                }
                string behaviorTest = FindArgument(args, "--behavior-self-test=");
                if (!String.IsNullOrEmpty(behaviorTest))
                {
                    WriteBehaviorSelfTest(behaviorTest, payload.Project);
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                GameForm form = new GameForm(payload.Project);
                string screenshot = FindArgument(args, "--screenshot=");
                if (!String.IsNullOrEmpty(screenshot)) form.CaptureOnShown(screenshot);
                Application.Run(form);
                return 0;
            }
            catch (Exception ex)
            {
                string errorFile = FindArgument(args, "--error-file=");
                if (!String.IsNullOrEmpty(errorFile))
                {
                    try { File.WriteAllText(errorFile, ex.ToString(), new UTF8Encoding(false)); } catch { }
                }
                else
                {
                    MessageBox.Show(ex.Message, "游戏启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                return 2;
            }
        }

        private static string FindArgument(string[] args, string prefix)
        {
            foreach (string arg in args)
            {
                if (arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return arg.Substring(prefix.Length).Trim('"');
            }
            return null;
        }

        private static void WriteConditionSelfTest(string path, ProjectData project)
        {
            Dictionary<string, double> flags = new Dictionary<string, double>();
            HashSet<string> read = new HashSet<string>();
            read.Add(project.startScene ?? "");
            HashSet<string> endings = new HashSet<string> { "good|Native End" };
            Func<string, bool> test = expression => new ConditionParser(expression, flags, read, project.scenes.Count, endings).ParseBoolean();
            Dictionary<string, object> report = new Dictionary<string, object>();
            report["sceneCount"] = test("sceneCount() == " + project.scenes.Count.ToString(CultureInfo.InvariantCulture));
            report["sceneRead"] = test("sceneRead('" + (project.startScene ?? "").Replace("'", "") + "')");
            report["endings"] = test("endings() == 1");
            report["endingSeenKind"] = test("endingSeen('good')");
            report["endingSeenTitle"] = test("endingSeen('good','Native End')");
            report["ok"] = report.Values.Cast<bool>().All(value => value);
            File.WriteAllText(path, Json.Create().Serialize(report), new UTF8Encoding(false));
        }

        private static void WriteSelfTest(string path, ProjectData project)
        {
            JavaScriptSerializer json = Json.Create();
            Dictionary<string, object> report = new Dictionary<string, object>();
            report["ok"] = project != null && project.scenes != null && project.scenes.Count > 0;
            report["format"] = "native-windows-application";
            report["runtime"] = "WinForms-GDI+";
            report["title"] = project == null ? "" : project.title;
            report["projectId"] = project == null ? "" : project.id;
            report["startScene"] = project == null ? "" : project.startScene;
            report["sceneCount"] = project == null || project.scenes == null ? 0 : project.scenes.Count;
            report["characterCount"] = project == null || project.characters == null ? 0 : project.characters.Count;
            string parent = Path.GetDirectoryName(Path.GetFullPath(path));
            if (!Directory.Exists(parent)) Directory.CreateDirectory(parent);
            File.WriteAllText(path, json.Serialize(report), new UTF8Encoding(false));
        }

        private static void WriteBehaviorSelfTest(string path, ProjectData project)
        {
            List<string> checks = new List<string>();
            Action<string, bool> check = delegate(string name, bool passed) { checks.Add(name + "=" + (passed ? "true" : "false")); };
            string parent = Path.GetDirectoryName(Path.GetFullPath(path));
            if (!Directory.Exists(parent)) Directory.CreateDirectory(parent);
            string settingsPath = null;
            try
            {
                settingsPath = PlayerSettings.FilePath(project);
                try { if (File.Exists(settingsPath)) File.Delete(settingsPath); } catch { }
                using (GameForm form = new GameForm(project))
                {
                    check("settings default speed", Math.Abs(form.TextSpeed - 30) < .001);
                    form.StartGame();
                    check("backlog records first line", form.Backlog.Count == 1 && form.Backlog[0].text == "Hello 1");
                    form.Advance();
                    check("reveal is not duplicated", form.Backlog.Count == 1);
                    form.Advance();
                    check("scene transition recorded", form.Backlog.Count == 2 && form.Backlog[1].text == "Done");
                    form.Advance();
                    form.Advance();
                    check("ending reached", form.Mode == PlayerMode.Ending);
                    check("no flag/read rerun on advance", form.Flags.Count == 1 && form.ReadScenesCount == 2);
                    int flagsBefore = form.Flags.Count, readBefore = form.ReadScenesCount, backlogBefore = form.Backlog.Count;
                    form.OpenOverlay(PlayerOverlay.Backlog);
                    check("backlog overlay opens", form.Overlay == PlayerOverlay.Backlog);
                    form.CloseOverlay();
                    check("backlog does not rerun flags or scenes", form.Flags.Count == flagsBefore && form.ReadScenesCount == readBefore && form.Backlog.Count == backlogBefore);
                    check("hide ui toggle on", form.UiHidden == false && form.Overlay == PlayerOverlay.None);
                    form.HideUi(true);
                    check("hide ui hides", form.UiHidden);
                    form.HideUi(false);
                    check("hide ui reversible", !form.UiHidden);
                    form.SetTextSpeed(15);
                    form.StartGame();
                    form.ResetTiming();
                    form.TickPlayback(45);
                    check("fast text reveal math", form.VisibleText.Length == 3);
                    form.SetTextSpeed(60);
                    form.ResetTiming();
                    form.TickPlayback(45);
                    check("slow text reveal math", form.VisibleText.Length == 0);
                    form.SetTextSpeed(0);
                    form.ResetTiming();
                    form.TickPlayback(1);
                    check("instant text reveal math", form.VisibleText.Length == 7);
                    form.SetTextSpeed(60);
                }
                PlayerSettings reloaded = PlayerSettings.Load(project);
                check("settings persisted on disk", Math.Abs(reloaded.textSpeed - 60) < .001);
            }
            catch (Exception ex)
            {
                checks.Add("exception=" + ex.GetType().Name + ":" + ex.Message);
            }
            finally
            {
                try { if (!String.IsNullOrEmpty(settingsPath) && File.Exists(settingsPath)) File.Delete(settingsPath); } catch { }
            }
            bool allOk = checks.TrueForAll(entry => entry.EndsWith("=true"));
            Dictionary<string, object> report = new Dictionary<string, object>();
            report["ok"] = allOk;
            report["checkCount"] = checks.Count;
            report["checks"] = checks;
            File.WriteAllText(path, Json.Create().Serialize(report), new UTF8Encoding(false));
        }
    }

    internal static class Json
    {
        public static JavaScriptSerializer Create()
        {
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            serializer.MaxJsonLength = Int32.MaxValue;
            serializer.RecursionLimit = 256;
            return serializer;
        }
    }

    internal sealed class Payload
    {
        public ProjectData Project;
        public string RawJson;
    }

    internal static class PayloadReader
    {
        public const string Magic = "VNSNATIVEAPP0001";
        private const int TrailerSize = 24;

        public static Payload Read(string executablePath)
        {
            byte[] magic = Encoding.ASCII.GetBytes(Magic);
            using (FileStream stream = new FileStream(executablePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                if (stream.Length < TrailerSize) throw new InvalidDataException("该文件没有包含 Visual Novel Studio 项目数据。");
                stream.Seek(-magic.Length, SeekOrigin.End);
                byte[] actualMagic = ReadExactly(stream, magic.Length);
                if (!actualMagic.SequenceEqual(magic)) throw new InvalidDataException("该文件不是完整的 Visual Novel Studio 原生游戏应用。");
                stream.Seek(-TrailerSize, SeekOrigin.End);
                long jsonLength = BitConverter.ToInt64(ReadExactly(stream, 8), 0);
                if (jsonLength <= 0 || jsonLength > stream.Length - TrailerSize || jsonLength > 256L * 1024L * 1024L)
                    throw new InvalidDataException("游戏项目数据长度无效。");
                stream.Seek(-(TrailerSize + jsonLength), SeekOrigin.End);
                byte[] bytes = ReadExactly(stream, checked((int)jsonLength));
                string raw = Encoding.UTF8.GetString(bytes);
                ProjectData project = Json.Create().Deserialize<ProjectData>(raw);
                ModelDefaults.Apply(project);
                if (project == null || project.scenes == null || project.scenes.Count == 0)
                    throw new InvalidDataException("游戏项目没有可播放场景。");
                return new Payload { Project = project, RawJson = raw };
            }
        }

        private static byte[] ReadExactly(Stream stream, int count)
        {
            byte[] buffer = new byte[count];
            int offset = 0;
            while (offset < count)
            {
                int read = stream.Read(buffer, offset, count - offset);
                if (read <= 0) throw new EndOfStreamException("游戏项目数据不完整。");
                offset += read;
            }
            return buffer;
        }
    }

    #region Project model
    public sealed class ProjectData
    {
        public ExperienceData experience { get; set; }
        public HomeData home { get; set; }
        public string id { get; set; }
        public string title { get; set; }
        public string startScene { get; set; }
        public Dictionary<string, object> flags { get; set; }
        public List<SceneData> scenes { get; set; }
        public List<LibraryCharacterData> characters { get; set; }
        public UiData ui { get; set; }
    }

    public sealed class ExperienceData
    {
        public Dictionary<string, List<CollectionEntry>> collections { get; set; }
        public List<CollectionEntry> chapters { get; set; }
        public List<string> homeMenu { get; set; }
        public Dictionary<string, MenuPosition> menuPositions { get; set; }
        public OpeningData opening { get; set; }
        public bool autosave { get; set; }
        public bool chapterSelection { get; set; }
        public bool skipRead { get; set; }
        public ExperienceData() { autosave = true; chapterSelection = true; skipRead = true; }
    }
    public sealed class CollectionEntry
    {
        public string id { get; set; }
        public string title { get; set; }
        public string source { get; set; }
        public string condition { get; set; }
        public string sceneId { get; set; }
    }
    public sealed class MenuPosition
    {
        public double x { get; set; }
        public double y { get; set; }
    }
    public sealed class OpeningData
    {
        public bool enabled { get; set; }
        public double duration { get; set; }
        public string image { get; set; }
    }
    internal sealed class ExperienceProgress
    {
        public HashSet<string> unlocks { get; set; }
        public HashSet<string> visited { get; set; }
        public HashSet<string> readLines { get; set; }
        public ExperienceProgress()
        {
            unlocks = new HashSet<string>();
            visited = new HashSet<string>();
            readLines = new HashSet<string>();
        }
        private sealed class Dto
        {
            public List<string> unlocks { get; set; }
            public List<string> visited { get; set; }
            public List<string> readLines { get; set; }
        }
        public static string FilePath(ProjectData project)
        {
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VisualNovelStudio", "Settings");
            Directory.CreateDirectory(folder);
            string safe = Regex.Replace(project.id ?? project.title ?? "game", "[^A-Za-z0-9_-]", "_");
            return Path.Combine(folder, safe + ".progress.json");
        }
        public static ExperienceProgress Load(ProjectData project)
        {
            ExperienceProgress progress = new ExperienceProgress();
            try
            {
                string path = FilePath(project);
                if (File.Exists(path))
                {
                    Dto dto = Json.Create().Deserialize<Dto>(File.ReadAllText(path, Encoding.UTF8));
                    if (dto != null)
                    {
                        if (dto.unlocks != null) foreach (string item in dto.unlocks) progress.unlocks.Add(item);
                        if (dto.visited != null) foreach (string item in dto.visited) progress.visited.Add(item);
                        if (dto.readLines != null) foreach (string item in dto.readLines) progress.readLines.Add(item);
                    }
                }
            }
            catch { }
            return progress;
        }
        public void Save(ProjectData project)
        {
            try
            {
                List<string> unlockList = new List<string>(unlocks); unlockList.Sort(StringComparer.Ordinal);
                List<string> visitedList = new List<string>(visited); visitedList.Sort(StringComparer.Ordinal);
                List<string> readList = new List<string>(readLines); readList.Sort(StringComparer.Ordinal);
                Dto dto = new Dto { unlocks = unlockList, visited = visitedList, readLines = readList };
                File.WriteAllText(FilePath(project), Json.Create().Serialize(dto), new UTF8Encoding(false));
            }
            catch { }
        }
    }
    public sealed class HomeData
    {
        public string logo { get; set; }
        public string bgm { get; set; }
        public double? logoX { get; set; }
        public double? logoY { get; set; }
        public string title { get; set; }
        public string subtitle { get; set; }
        public string background { get; set; }
        public string backgroundColor { get; set; }
        public string textColor { get; set; }
        public string accentColor { get; set; }
        public string startLabel { get; set; }
        public string continueLabel { get; set; }
        public string loadLabel { get; set; }
    }
    public sealed class SceneData
    {
        public string id { get; set; }
        public string name { get; set; }
        public string bg { get; set; }
        public string bgImage { get; set; }
        public string speaker { get; set; }
        public string text { get; set; }
        public string next { get; set; }
        public string video { get; set; }
        public string bgm { get; set; }
        public List<DialogueData> dialogues { get; set; }
        public List<ChoiceData> choices { get; set; }
        public List<AutoBranchData> autoBranches { get; set; }
        public List<FlagOperationData> setFlags { get; set; }
        public EndingData ending { get; set; }
        public List<SceneCharacterData> characters { get; set; }
    }

    public sealed class DialogueData
    {
        public string speaker { get; set; }
        public string text { get; set; }
        public string charId { get; set; }
        public string actionId { get; set; }
        public string expressionId { get; set; }
        public string voice { get; set; }
    }

    public sealed class ChoiceData
    {
        public string id { get; set; }
        public string text { get; set; }
        public string target { get; set; }
        public string cond { get; set; }
        public List<FlagOperationData> setFlags { get; set; }
    }

    public sealed class AutoBranchData
    {
        public string target { get; set; }
        public string cond { get; set; }
    }

    public sealed class FlagOperationData
    {
        public string flag { get; set; }
        public string op { get; set; }
        public double value { get; set; }
    }

    public sealed class EndingData
    {
        public string kind { get; set; }
        public string title { get; set; }
    }

    public sealed class SceneCharacterData
    {
        public string id { get; set; }
        public string name { get; set; }
        public string image { get; set; }
        public string charId { get; set; }
        public string actionId { get; set; }
        public string expressionId { get; set; }
        public double? x { get; set; }
        public double? y { get; set; }
        public double? scale { get; set; }
        public double? opacity { get; set; }
        public double? rotate { get; set; }
    }

    public sealed class LibraryCharacterData
    {
        public string id { get; set; }
        public string name { get; set; }
        public string baseImage { get; set; }
        public List<CharacterImageData> expressions { get; set; }
        public List<CharacterActionData> actions { get; set; }
    }

    public sealed class CharacterImageData
    {
        public string id { get; set; }
        public string name { get; set; }
        public string image { get; set; }
    }

    public sealed class CharacterActionData
    {
        public string id { get; set; }
        public string name { get; set; }
        public string image { get; set; }
    }

    public sealed class UiData
    {
        public TextboxUiData textbox { get; set; }
        public SpeakerUiData speaker { get; set; }
        public ChoicesUiData choices { get; set; }
    }

    public sealed class TextboxUiData
    {
        public bool show { get; set; }
        public double? opacity { get; set; }
        public string bg { get; set; }
        public string border { get; set; }
        public string fontColor { get; set; }
        public float fontSize { get; set; }
    }

    public sealed class SpeakerUiData
    {
        public bool show { get; set; }
        public string bg { get; set; }
        public string color { get; set; }
        public float fontSize { get; set; }
    }

    public sealed class ChoicesUiData
    {
        public bool show { get; set; }
        public double? opacity { get; set; }
        public string bg { get; set; }
        public string border { get; set; }
        public string color { get; set; }
        public float fontSize { get; set; }
    }

    internal static class ModelDefaults
    {
        public static void Apply(ProjectData p)
        {
            if (p == null) return;
            if (String.IsNullOrEmpty(p.id)) p.id = "visual-novel-game";
            if (String.IsNullOrEmpty(p.title)) p.title = "未命名作品";
            if (p.home == null) p.home = new HomeData();
            if (p.experience == null) p.experience = new ExperienceData();
            if (p.experience.collections == null) p.experience.collections = new Dictionary<string, List<CollectionEntry>>();
            foreach (string bucket in new [] { "cgs", "music", "endings", "achievements" }) if (!p.experience.collections.ContainsKey(bucket)) p.experience.collections[bucket] = new List<CollectionEntry>();
            if (p.experience.chapters == null) p.experience.chapters = new List<CollectionEntry>();
            if (p.experience.menuPositions == null) p.experience.menuPositions = new Dictionary<string, MenuPosition>();
            if (p.experience.opening == null) p.experience.opening = new OpeningData();
            p.home.logoX = p.home.logoX ?? 50; p.home.logoY = p.home.logoY ?? 30;
            p.home.bgm = p.home.bgm ?? "";
            p.home.title = p.home.title ?? p.title;
            p.home.subtitle = p.home.subtitle ?? "";
            p.home.backgroundColor = p.home.backgroundColor ?? "#181421";
            p.home.textColor = p.home.textColor ?? "#FFFFFF";
            p.home.accentColor = p.home.accentColor ?? "#FB7299";
            p.home.startLabel = p.home.startLabel ?? "开始游戏";
            p.home.continueLabel = p.home.continueLabel ?? "继续游戏";
            p.home.loadLabel = p.home.loadLabel ?? "读取存档";
            if (p.flags == null) p.flags = new Dictionary<string, object>();
            if (p.scenes == null) p.scenes = new List<SceneData>();
            if (p.characters == null) p.characters = new List<LibraryCharacterData>();
            if (String.IsNullOrEmpty(p.startScene) && p.scenes.Count > 0) p.startScene = p.scenes[0].id;
            foreach (SceneData s in p.scenes)
            {
                if (String.IsNullOrEmpty(s.bg)) s.bg = "#181B26";
                if (s.dialogues == null) s.dialogues = new List<DialogueData>();
                if (s.choices == null) s.choices = new List<ChoiceData>();
                if (s.autoBranches == null) s.autoBranches = new List<AutoBranchData>();
                if (s.setFlags == null) s.setFlags = new List<FlagOperationData>();
                if (s.characters == null) s.characters = new List<SceneCharacterData>();
                foreach (ChoiceData c in s.choices) if (c.setFlags == null) c.setFlags = new List<FlagOperationData>();
                foreach (SceneCharacterData c in s.characters)
                {
                    if (!c.x.HasValue) c.x = 50;
                    if (!c.y.HasValue) c.y = 88;
                    if (!c.scale.HasValue) c.scale = 1;
                    if (!c.opacity.HasValue) c.opacity = 1;
                    if (!c.rotate.HasValue) c.rotate = 0;
                }
            }
            foreach (LibraryCharacterData c in p.characters)
            {
                if (c.expressions == null) c.expressions = new List<CharacterImageData>();
                if (c.actions == null) c.actions = new List<CharacterActionData>();
            }
            if (p.ui == null) p.ui = new UiData();
            if (p.ui.textbox == null) p.ui.textbox = new TextboxUiData { show = true, opacity = .9, bg = "#111827", border = "#FB7299", fontColor = "#FFFFFF", fontSize = 20 };
            if (p.ui.speaker == null) p.ui.speaker = new SpeakerUiData { show = true, bg = "#FB7299", color = "#FFFFFF", fontSize = 14 };
            if (p.ui.choices == null) p.ui.choices = new ChoicesUiData { show = true, opacity = .94, bg = "#FFFFFF", border = "#FB7299", color = "#C75C7E", fontSize = 16 };
        }
    }
    #endregion

    internal enum PlayerMode { Title, Playing, Choices, Ending }

    internal enum PlayerOverlay { None, Settings, Backlog, Gallery, Chapters }

    internal enum OverlayAction
    {
        None, SpeedSlow, SpeedStandard, SpeedFast, SpeedInstant, Close,
        GalleryTab, GalleryScrollUp, GalleryScrollDown, ChapterJump, ChaptersScrollUp, ChaptersScrollDown
    }

    internal sealed class HomeMenuItem
    {
        public string Key;
        public string Label;
        public bool Enabled;
        public HomeMenuItem(string key, string label, bool enabled)
        {
            Key = key; Label = label; Enabled = enabled;
        }
    }

    internal sealed class PlayerSnapshot
    {
        public string sceneId { get; set; }
        public int dialogueIndex { get; set; }
        public Dictionary<string, double> flags { get; set; }
        public List<string> readScenes { get; set; }
        public List<string> unlockedEndings { get; set; }
        public string mode { get; set; }
        public string endingTitle { get; set; }
    }

    internal sealed class VisualInfo
    {
        public string Name;
        public string Source;
    }

    internal sealed class BacklogEntry
    {
        public string speaker { get; set; }
        public string text { get; set; }
        public string sceneId { get; set; }
    }

    internal sealed class PlayerSettings
    {
        public double textSpeed { get; set; }
        public PlayerSettings() { textSpeed = 30; }
        private const string AppFolder = "VisualNovelStudio";
        public static string FilePath(ProjectData project)
        {
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppFolder, "Settings");
            Directory.CreateDirectory(folder);
            string safe = Regex.Replace(project.id ?? project.title ?? "game", "[^A-Za-z0-9_-]", "_");
            return Path.Combine(folder, safe + ".settings.json");
        }
        public static PlayerSettings Load(ProjectData project)
        {
            PlayerSettings settings = new PlayerSettings();
            try
            {
                string path = FilePath(project);
                if (File.Exists(path))
                {
                    PlayerSettings saved = Json.Create().Deserialize<PlayerSettings>(File.ReadAllText(path, Encoding.UTF8));
                    if (saved != null)
                    {
                        double value = saved.textSpeed;
                        if (value == 0 || value == 15 || value == 30 || value == 60) settings.textSpeed = value;
                    }
                }
            }
            catch { }
            return settings;
        }
        public void Save(ProjectData project)
        {
            try { File.WriteAllText(FilePath(project), Json.Create().Serialize(this), new UTF8Encoding(false)); }
            catch { }
        }
        public string SpeedLabel()
        {
            if (textSpeed <= 0) return "立即显示";
            if (textSpeed <= 15) return "快";
            if (textSpeed >= 60) return "慢";
            return "标准";
        }
    }

    internal sealed class GameForm : Form
    {
        private readonly ProjectData project;
        private readonly GameCanvas canvas;
        private readonly ToolStrip toolbar;
        private readonly Dictionary<string, double> flags = new Dictionary<string, double>();
        private readonly List<PlayerSnapshot> history = new List<PlayerSnapshot>();
        private readonly HashSet<string> readScenes = new HashSet<string>();
        private readonly HashSet<string> unlockedEndings = new HashSet<string>();
        private SceneData scene;
        private int dialogueIndex;
        private PlayerMode mode = PlayerMode.Title;
        private string endingTitle = "";
        private bool fullscreen;
        private bool paused, skipping, automatic;
        private bool uiHidden;
        private readonly PlayerSettings playerSettings;
        private readonly List<BacklogEntry> backlog = new List<BacklogEntry>();
        private string loggedLineKey = "";
        private bool pausedBeforeOverlay;
        internal PlayerOverlay Overlay { get; private set; }
        internal IList<BacklogEntry> Backlog { get { return backlog; } }
        internal double TextSpeed { get { return playerSettings.textSpeed; } }
        internal string TextSpeedLabel() { return playerSettings.SpeedLabel(); }
        internal bool UiHidden { get { return uiHidden; } }
        public int ReadScenesCount { get { return readScenes.Count; } }
        internal const string MusicUnsupportedMessage = "音频不支持：本播放器基于 WinForms/GDI+，不含音频引擎，音乐鉴赏条目仅作收藏展示，无法试听。";
        internal static readonly string[] GalleryBucketKeys = { "cgs", "music", "endings", "achievements" };
        internal static readonly string[] GalleryBucketLabels = { "CG 画廊", "音乐鉴赏", "结局收藏", "成就" };
        private static readonly string[] TitleMenuKeys = { "start", "continue", "load", "gallery", "settings", "chapters" };
        private readonly ExperienceProgress progress;
        private readonly HashSet<string> visitedAll = new HashSet<string>();
        private readonly HashSet<string> readLines = new HashSet<string>();
        private int progressDirtySinceSave;
        private int galleryBucketIndex;
        private int galleryScrollStep, chaptersScrollStep;
        private bool openingVisible, openingClosing;
        private double openingAlpha, openingHoldRemaining;
        private double playbackRate = 1, elapsed;
        private int revealed;
        private readonly Timer playbackTimer = new Timer();
        private readonly System.Diagnostics.Stopwatch clock = new System.Diagnostics.Stopwatch();
        public string VisibleText { get { string text = DisplayText(CurrentDialogue == null ? "" : CurrentDialogue.text); return text.Substring(0, Math.Min(revealed, text.Length)); } }
        internal void ResetTiming() { elapsed = 0; revealed = 0; }
        internal bool Skipping { get { return skipping; } }
        internal void SetSkipping(bool value) { skipping = value; if (value) automatic = false; }
        internal bool SkipReadEnabled { get { return project.experience.skipRead; } }
        internal int ReadLinesCount { get { return readLines.Count; } }
        internal void TickPlayback(double milliseconds)
        {
            if (paused || mode != PlayerMode.Playing) { if (mode != PlayerMode.Playing) skipping = automatic = false; return; }
            double speed = playerSettings.textSpeed <= 0 ? 1 : playerSettings.textSpeed;
            elapsed += milliseconds * playbackRate;
            int length = DisplayText(CurrentDialogue == null ? "" : CurrentDialogue.text).Length;
            revealed = (skipping || playerSettings.textSpeed <= 0) ? length : Math.Min(length, (int)(elapsed / speed));
            if (skipping && elapsed >= 140)
            {
                if (SkipReadShouldStop())
                {
                    skipping = false; automatic = false;
                    canvas.ShowNotice("已读到未读内容，快进停止");
                }
                else Advance();
            }
            else if (automatic && elapsed >= length * speed + 900) Advance();
            canvas.Invalidate();
        }
        internal void TickOpening(double milliseconds)
        {
            if (!openingVisible) return;
            const double fade = 240;
            if (!openingClosing)
            {
                openingAlpha += milliseconds / fade;
                if (openingAlpha >= 1)
                {
                    openingAlpha = 1;
                    openingHoldRemaining -= milliseconds;
                    if (openingHoldRemaining <= 0) openingClosing = true;
                }
            }
            else
            {
                openingAlpha -= milliseconds / fade;
                if (openingAlpha <= 0) { openingAlpha = 0; openingVisible = false; }
            }
            canvas.Invalidate();
        }
        internal bool OpeningVisible { get { return openingVisible; } }
        internal double OpeningAlpha { get { return openingAlpha; } }
        internal void BeginOpening()
        {
            OpeningData opening = project.experience.opening;
            if (opening == null || !opening.enabled) return;
            if (String.IsNullOrWhiteSpace(opening.image)) return;
            openingVisible = true;
            openingClosing = false;
            openingAlpha = 0;
            openingHoldRemaining = opening.duration > 0 ? opening.duration : 2400;
            canvas.Invalidate();
        }
        internal void SkipOpening()
        {
            if (!openingVisible) return;
            openingClosing = true;
        }
        private FormBorderStyle previousBorder;
        private FormWindowState previousState;

        public GameForm(ProjectData value)
        {
            project = value;
            ModelDefaults.Apply(project);
            Text = project.title + " - Visual Novel";
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(840, 520);
            ClientSize = new Size(1280, 720);
            BackColor = Color.FromArgb(18, 20, 29);
            KeyPreview = true;

            toolbar = BuildToolbar();
            canvas = new GameCanvas(this);
            canvas.Dock = DockStyle.Fill;
            Controls.Add(canvas);
            Controls.Add(toolbar);
            KeyDown += OnGameKeyDown;
            playbackTimer.Interval = 16;
            clock.Start();
            playbackTimer.Tick += delegate { double dt = clock.Elapsed.TotalMilliseconds; clock.Restart(); TickPlayback(Math.Min(100, dt)); TickOpening(Math.Min(100, dt)); };
            playerSettings = PlayerSettings.Load(project);
            progress = ExperienceProgress.Load(project);
            if (progress.visited != null) foreach (string item in progress.visited) visitedAll.Add(item);
            if (progress.readLines != null) foreach (string item in progress.readLines) readLines.Add(item);
            playbackTimer.Start();
            Shown += delegate { BeginOpening(); };
            FormClosed += delegate { playbackTimer.Dispose(); playerSettings.Save(project); SaveProgressState(true); };
        }

        private string CurrentLineKey()
        {
            if (scene == null) return "";
            return scene.id + ":" + dialogueIndex.ToString(CultureInfo.InvariantCulture);
        }

        private void LogCurrentLineIfNew()
        {
            if (scene == null || mode != PlayerMode.Playing) return;
            DialogueData dialogue = CurrentDialogue;
            if (dialogue == null) return;
            string key = CurrentLineKey();
            if (key == loggedLineKey) return;
            loggedLineKey = key;
            if (readLines.Add(key)) progressDirtySinceSave++;
            string text = DisplayText(dialogue.text ?? "");
            if (String.IsNullOrEmpty(text) && String.IsNullOrEmpty(dialogue.speaker)) return;
            backlog.Add(new BacklogEntry { speaker = dialogue.speaker ?? "", text = text, sceneId = scene.id });
            if (backlog.Count > 500) backlog.RemoveRange(0, backlog.Count - 500);
        }

        internal void OpenOverlay(PlayerOverlay kind)
        {
            if (kind == PlayerOverlay.None) { CloseOverlay(); return; }
            if (Overlay == kind) { CloseOverlay(); return; }
            if (kind == PlayerOverlay.Gallery) { galleryBucketIndex = 0; galleryScrollStep = 0; SyncGalleryUnlocks(); }
            if (kind == PlayerOverlay.Chapters) chaptersScrollStep = 0;
            if (Overlay == PlayerOverlay.None) pausedBeforeOverlay = paused;
            Overlay = kind;
            paused = true;
            skipping = automatic = false;
            ResetTiming();
            canvas.Invalidate();
        }

        internal void CloseOverlay()
        {
            if (Overlay == PlayerOverlay.None) return;
            Overlay = PlayerOverlay.None;
            paused = pausedBeforeOverlay;
            canvas.Invalidate();
        }

        internal void PerformOverlayAction(OverlayAction action, int payload)
        {
            switch (action)
            {
                case OverlayAction.SpeedSlow: SetTextSpeed(60); break;
                case OverlayAction.SpeedStandard: SetTextSpeed(30); break;
                case OverlayAction.SpeedFast: SetTextSpeed(15); break;
                case OverlayAction.SpeedInstant: SetTextSpeed(0); break;
                case OverlayAction.Close: CloseOverlay(); break;
                case OverlayAction.GalleryTab: SetGalleryBucket(payload); break;
                case OverlayAction.GalleryScrollUp: AdjustGalleryScroll(-1); break;
                case OverlayAction.GalleryScrollDown: AdjustGalleryScroll(+1); break;
                case OverlayAction.ChapterJump: JumpToChapterAt(payload); break;
                case OverlayAction.ChaptersScrollUp: AdjustChaptersScroll(-1); break;
                case OverlayAction.ChaptersScrollDown: AdjustChaptersScroll(+1); break;
            }
        }

        internal void PerformOverlayAction(OverlayAction action)
        {
            PerformOverlayAction(action, -1);
        }

        private bool SkipReadShouldStop()
        {
            if (!project.experience.skipRead || mode != PlayerMode.Playing) return false;
            if (scene == null) return false;
            if (!readLines.Contains(scene.id + ":" + dialogueIndex.ToString(CultureInfo.InvariantCulture))) return true;
            List<DialogueData> list = CurrentDialogues();
            if (dialogueIndex + 1 < list.Count)
            {
                string nextKey = scene.id + ":" + (dialogueIndex + 1).ToString(CultureInfo.InvariantCulture);
                return !readLines.Contains(nextKey);
            }
            if (scene.ending != null) return false;
            if (scene.choices != null && scene.choices.Count > 0 && scene.choices.Any(choice => Evaluate(choice.cond))) return false;
            AutoBranchData branch = scene.autoBranches.FirstOrDefault(item => Evaluate(item.cond));
            string target = branch == null ? scene.next : branch.target;
            if (String.IsNullOrEmpty(target)) return false;
            SceneData targetScene = project.scenes.FirstOrDefault(item => item.id == target);
            if (targetScene == null) return false;
            if (!visitedAll.Contains(targetScene.id) && !readScenes.Contains(targetScene.id)) return true;
            List<DialogueData> targetLines = TargetDialogues(targetScene);
            if (targetLines.Count == 0) return false;
            return !readLines.Contains(targetScene.id + ":0");
        }

        private static List<DialogueData> TargetDialogues(SceneData targetScene)
        {
            if (targetScene == null) return new List<DialogueData>();
            if (targetScene.dialogues != null && targetScene.dialogues.Count > 0) return targetScene.dialogues;
            if (!String.IsNullOrWhiteSpace(targetScene.text)) return new List<DialogueData> { new DialogueData { speaker = targetScene.speaker ?? "", text = targetScene.text } };
            return new List<DialogueData>();
        }

        internal void SetGalleryBucket(int index)
        {
            if (index < 0 || index >= GalleryBucketKeys.Length) return;
            galleryBucketIndex = index;
            galleryScrollStep = 0;
            SyncGalleryUnlocks();
            canvas.Invalidate();
        }
        internal int GalleryBucketIndex { get { return galleryBucketIndex; } }
        internal string GalleryBucketKey { get { return GalleryBucketKeys[Math.Max(0, Math.Min(GalleryBucketKeys.Length - 1, galleryBucketIndex))]; } }
        internal int GalleryScrollStep { get { return galleryScrollStep; } set { galleryScrollStep = Math.Max(0, value); } }
        internal int ChaptersScrollStep { get { return chaptersScrollStep; } set { chaptersScrollStep = Math.Max(0, value); } }
        internal void AdjustGalleryScroll(int delta) { galleryScrollStep = Math.Max(0, galleryScrollStep + delta); canvas.Invalidate(); }
        internal void AdjustChaptersScroll(int delta) { chaptersScrollStep = Math.Max(0, chaptersScrollStep + delta); canvas.Invalidate(); }
        internal bool MusicPlaybackSupported { get { return false; } }

        internal IList<CollectionEntry> GalleryEntriesFor(string bucket)
        {
            if (project.experience == null || project.experience.collections == null) return new List<CollectionEntry>();
            List<CollectionEntry> list;
            if (!project.experience.collections.TryGetValue(bucket ?? "", out list) || list == null) return new List<CollectionEntry>();
            return list;
        }

        internal bool EntryUnlockedFor(string bucket, CollectionEntry entry)
        {
            if (entry == null) return true;
            if (String.IsNullOrWhiteSpace(entry.condition)) return true;
            string ns = (bucket ?? "") + ":" + (entry.id ?? "");
            if (progress.unlocks.Contains(ns)) return true;
            return Evaluate(entry.condition);
        }

        private void SyncGalleryUnlocks()
        {
            if (project.experience == null || project.experience.collections == null) return;
            bool changed = false;
            foreach (string bucket in GalleryBucketKeys)
            {
                List<CollectionEntry> list;
                if (!project.experience.collections.TryGetValue(bucket, out list) || list == null) continue;
                foreach (CollectionEntry entry in list)
                {
                    if (entry == null || String.IsNullOrWhiteSpace(entry.condition)) continue;
                    if (Evaluate(entry.condition) && progress.unlocks.Add(bucket + ":" + (entry.id ?? ""))) changed = true;
                }
            }
            if (changed) { SaveProgressState(true); canvas.Invalidate(); }
        }

        internal void RefreshGalleryUnlocks() { SyncGalleryUnlocks(); }

        private void SaveProgressState(bool force)
        {
            if (!force && progressDirtySinceSave < 25) return;
            try
            {
                progress.visited.Clear();
                progress.visited.UnionWith(visitedAll);
                progress.readLines.Clear();
                progress.readLines.UnionWith(readLines);
                if (progress.readLines.Count > 8000)
                {
                    HashSet<string>.Enumerator enumerator = progress.readLines.GetEnumerator();
                    while (progress.readLines.Count > 8000 && enumerator.MoveNext()) progress.readLines.Remove(enumerator.Current);
                }
                progress.Save(project);
                progressDirtySinceSave = 0;
            }
            catch { }
        }

        private void MarkReadingProgressDirty()
        {
            progressDirtySinceSave++;
            if (progressDirtySinceSave >= 25) SaveProgressState(false);
        }

        internal string ProgressFilePath { get { return ExperienceProgress.FilePath(project); } }

        internal IList<CollectionEntry> Chapters { get { return project.experience == null || project.experience.chapters == null ? new List<CollectionEntry>() : project.experience.chapters; } }
        internal bool ChapterSelectionEnabled { get { return project.experience != null && project.experience.chapterSelection; } }
        internal bool IsChapterSceneAvailable(string sceneId)
        {
            if (!ChapterSelectionEnabled) return false;
            if (String.IsNullOrEmpty(sceneId)) return false;
            if (!readScenes.Contains(sceneId)) return false;
            return project.scenes.Any(item => item.id == sceneId);
        }
        internal bool TryJumpToChapter(string sceneId)
        {
            if (!ChapterSelectionEnabled) { canvas.ShowNotice("章节选择未启用（体验设置）"); return false; }
            SceneData target = String.IsNullOrEmpty(sceneId) ? null : project.scenes.FirstOrDefault(item => item.id == sceneId);
            if (target == null) { canvas.ShowNotice("章节目标场景不存在"); return false; }
            if (!readScenes.Contains(sceneId)) { canvas.ShowNotice("尚未读过该章节的场景"); return false; }
            CloseOverlay();
            paused = false; skipping = automatic = false;
            ResetTiming();
            EnterScene(sceneId, null, true);
            canvas.ShowNotice("已跳转到章节");
            return true;
        }
        private void JumpToChapterAt(int index)
        {
            IList<CollectionEntry> chapters = Chapters;
            if (index < 0 || index >= chapters.Count) return;
            TryJumpToChapter(chapters[index].sceneId);
        }
        internal bool AutosaveEnabled { get { return project.experience != null && project.experience.autosave; } }

        internal static string SavesDirectory()
        {
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VisualNovelStudio", "Saves");
            Directory.CreateDirectory(folder);
            return folder;
        }
        private static string SaveBaseName(ProjectData project)
        {
            return Regex.Replace(project.id ?? project.title ?? "game", "[^A-Za-z0-9_-]", "_");
        }
        internal static string ManualSlotFile(ProjectData project, int slot)
        {
            return Path.Combine(SavesDirectory(), SaveBaseName(project) + (slot == 0 ? "" : "_" + slot.ToString(CultureInfo.InvariantCulture)) + ".json");
        }
        internal static string AutosaveFile(ProjectData project)
        {
            return Path.Combine(SavesDirectory(), SaveBaseName(project) + "_autosave.json");
        }

        private string SavePath(int slot)
        {
            return ManualSlotFile(project, slot);
        }

        internal string AutosaveFilePath { get { return AutosaveFile(project); } }

        private void WriteAutosave()
        {
            if (scene == null || mode == PlayerMode.Title) return;
            try { File.WriteAllText(AutosaveFilePath, Json.Create().Serialize(CaptureSnapshot()), new UTF8Encoding(false)); }
            catch { }
        }

        internal void SetTextSpeed(double value)
        {
            playerSettings.textSpeed = value;
            playerSettings.Save(project);
            ResetTiming();
            canvas.ShowNotice("文字速度：" + playerSettings.SpeedLabel());
            canvas.Invalidate();
        }

        internal void HideUi(bool value)
        {
            if (uiHidden == value) return;
            uiHidden = value;
            toolbar.Visible = !value;
            if (value) skipping = automatic = false;
            ResetTiming();
            canvas.Invalidate();
        }

        internal void ClearBacklog() { backlog.Clear(); loggedLineKey = ""; }

        private ToolStrip BuildToolbar()
        {
            ToolStrip strip = new ToolStrip();
            strip.Dock = DockStyle.Top;
            strip.GripStyle = ToolStripGripStyle.Hidden;
            strip.BackColor = Color.FromArgb(31, 34, 47);
            strip.ForeColor = Color.White;
            strip.Padding = new Padding(8, 4, 8, 4);
            strip.Renderer = new DarkToolStripRenderer();
            AddButton(strip, "标题", delegate { ShowTitle(); });
            AddButton(strip, "重新开始", delegate { StartGame(); });
            AddButton(strip, "后退", delegate { GoBack(); });
            AddButton(strip, "暂停 / 继续", delegate { paused = !paused; canvas.ShowNotice(paused ? "已暂停" : "继续播放"); });
            AddButton(strip, "2× / 1×", delegate { playbackRate = playbackRate == 1 ? 2 : 1; canvas.ShowNotice(playbackRate + "×"); });
            AddButton(strip, "快进", delegate { skipping = !skipping; automatic = false; });
            AddButton(strip, "自动", delegate { automatic = !automatic; skipping = false; });
            AddButton(strip, "设置 (S)", delegate { OpenOverlay(PlayerOverlay.Settings); });
            AddButton(strip, "记录 (L)", delegate { OpenOverlay(PlayerOverlay.Backlog); });
            AddButton(strip, "画廊", delegate { OpenOverlay(PlayerOverlay.Gallery); });
            AddButton(strip, "章节", delegate { OpenOverlay(PlayerOverlay.Chapters); });
            AddButton(strip, "隐藏界面 (H)", delegate { HideUi(true); });
            AddButton(strip, "存档", delegate { OpenSlots(false); });
            AddButton(strip, "读档", delegate { OpenSlots(true); });
            strip.Items.Add(new ToolStripSeparator());
            AddButton(strip, "快速保存", delegate { SaveProgress(); });
            AddButton(strip, "快速读取", delegate { LoadProgress(); });
            strip.Items.Add(new ToolStripSeparator());
            AddButton(strip, "全屏", delegate { ToggleFullscreen(); });
            ToolStripButton volumeUnsupported = new ToolStripButton("音量：本机播放器不支持音频");
            volumeUnsupported.DisplayStyle = ToolStripItemDisplayStyle.Text;
            volumeUnsupported.Enabled = false;
            volumeUnsupported.ForeColor = Color.FromArgb(118, 124, 146);
            strip.Items.Add(volumeUnsupported);
            ToolStripLabel hint = new ToolStripLabel("  Space/Enter 继续 · Back 后退 · 数字键选择 · S 设置 · L 记录 · H 隐藏界面");
            hint.ForeColor = Color.FromArgb(177, 184, 205);
            strip.Items.Add(hint);
            return strip;
        }

        private static void AddButton(ToolStrip strip, string text, EventHandler click)
        {
            ToolStripButton button = new ToolStripButton(text);
            button.DisplayStyle = ToolStripItemDisplayStyle.Text;
            button.ForeColor = Color.White;
            button.Margin = new Padding(2, 0, 2, 0);
            button.Click += click;
            strip.Items.Add(button);
        }

        public ProjectData Project { get { return project; } }
        public SceneData CurrentScene { get { return scene; } }
        public PlayerMode Mode { get { return mode; } }
        public string EndingTitle { get { return endingTitle; } }
        public IDictionary<string, double> Flags { get { return flags; } }
        public IList<ChoiceData> VisibleChoices { get; private set; }

        public DialogueData CurrentDialogue
        {
            get
            {
                List<DialogueData> list = CurrentDialogues();
                return dialogueIndex >= 0 && dialogueIndex < list.Count ? list[dialogueIndex] : null;
            }
        }

        public void StartGame()
        {
            paused = skipping = automatic = false; ResetTiming();
            Overlay = PlayerOverlay.None;
            pausedBeforeOverlay = false;
            uiHidden = false;
            toolbar.Visible = true;
            flags.Clear();
            if (project.flags != null)
                foreach (KeyValuePair<string, object> pair in project.flags) flags[pair.Key] = ConvertNumber(pair.Value);
            history.Clear();
            readScenes.Clear();
            endingTitle = "";
            scene = null;
            ClearBacklog();
            EnterScene(project.startScene, null, false);
        }

        public void ShowTitle()
        {
            paused = skipping = automatic = false;
            mode = PlayerMode.Title;
            VisibleChoices = new List<ChoiceData>();
            canvas.Invalidate();
        }

        internal string CurrentSceneId { get { return scene == null ? "" : scene.id; } }
        internal bool HasReadScene(string sceneId) { return !String.IsNullOrEmpty(sceneId) && readScenes.Contains(sceneId); }
        internal bool EverVisited(string sceneId) { return !String.IsNullOrEmpty(sceneId) && (visitedAll.Contains(sceneId) || readScenes.Contains(sceneId)); }

        internal MenuPosition MenuPositionOf(string key)
        {
            if (project.experience == null || project.experience.menuPositions == null) return null;
            MenuPosition pos;
            if (!project.experience.menuPositions.TryGetValue(key, out pos)) return null;
            if (pos == null) return null;
            if (Double.IsNaN(pos.x) || Double.IsNaN(pos.y) || pos.x < 0 || pos.x > 100 || pos.y < 0 || pos.y > 100) return null;
            return pos;
        }

        internal IList<HomeMenuItem> HomeMenuItems()
        {
            List<HomeMenuItem> items = new List<HomeMenuItem>();
            ExperienceData exp = project.experience;
            List<string> keys;
            if (exp.homeMenu == null) keys = new List<string> { "start", "continue", "load" };
            else keys = exp.homeMenu.Where(key => TitleMenuKeys.Contains(key)).ToList();
            foreach (string key in keys)
            {
                string label;
                bool enabled = true;
                switch (key)
                {
                    case "start": label = String.IsNullOrEmpty(project.home.startLabel) ? "开始游戏" : project.home.startLabel; break;
                    case "continue": label = String.IsNullOrEmpty(project.home.continueLabel) ? "继续游戏" : project.home.continueLabel; break;
                    case "load": label = String.IsNullOrEmpty(project.home.loadLabel) ? "读取存档" : project.home.loadLabel; break;
                    case "gallery": label = "画廊"; break;
                    case "settings": label = "设置"; break;
                    case "chapters": label = "章节选择"; enabled = exp.chapterSelection; break;
                    default: continue;
                }
                items.Add(new HomeMenuItem(key, label, enabled));
            }
            return items;
        }

        private void EnterScene(string id, IList<FlagOperationData> choiceOperations, bool remember)
        {
            bool hadScene = scene != null;
            SceneData target = project.scenes.FirstOrDefault(item => item.id == id);
            if (target == null)
            {
                mode = PlayerMode.Ending;
                endingTitle = "缺少场景：" + id;
                canvas.Invalidate();
                return;
            }
            if (remember && scene != null) history.Add(CaptureSnapshot());
            if (choiceOperations != null) ApplyOperations(choiceOperations);
            scene = target;
            readScenes.Add(scene.id ?? "");
            if (visitedAll.Add(scene.id ?? "")) progressDirtySinceSave++;
            ApplyOperations(scene.setFlags);
            dialogueIndex = 0;
            ResetTiming();
            mode = PlayerMode.Playing;
            LogCurrentLineIfNew();
            VisibleChoices = new List<ChoiceData>();
            canvas.SceneChanged();
            if (CurrentDialogues().Count == 0) ShowOutcome();
            else
            {
                if (hadScene && AutosaveEnabled) WriteAutosave();
                SaveProgressState(false);
            }
            SyncGalleryUnlocks();
            canvas.Invalidate();
        }

        public void Advance()
        {
            if (paused) return;
            if (mode == PlayerMode.Title || mode == PlayerMode.Ending) { StartGame(); return; }
            if (mode == PlayerMode.Choices) return;
            int length = DisplayText(CurrentDialogue == null ? "" : CurrentDialogue.text).Length;
            if (revealed < length) { revealed = length; elapsed = length * (playerSettings.textSpeed <= 0 ? 1 : playerSettings.textSpeed); canvas.Invalidate(); return; }
            List<DialogueData> list = CurrentDialogues();
            if (dialogueIndex < list.Count - 1)
            {
                history.Add(CaptureSnapshot());
                dialogueIndex++;
                ResetTiming();
                LogCurrentLineIfNew();
                canvas.SceneChanged();
                canvas.Invalidate();
                return;
            }
            ShowOutcome();
        }

        private void ShowOutcome()
        {
            if (scene == null) return;
            if (scene.ending != null)
            {
                mode = PlayerMode.Ending;
                endingTitle = String.IsNullOrEmpty(scene.ending.title) ? "END" : scene.ending.title;
                unlockedEndings.Add((scene.ending.kind ?? "custom") + "|" + endingTitle);
                SyncGalleryUnlocks();
                SaveProgressState(false);
                canvas.Invalidate();
                return;
            }
            List<ChoiceData> choices = scene.choices.Where(item => Evaluate(item.cond)).ToList();
            if (choices.Count > 0)
            {
                mode = PlayerMode.Choices;
                VisibleChoices = choices;
                canvas.Invalidate();
                return;
            }
            AutoBranchData branch = scene.autoBranches.FirstOrDefault(item => Evaluate(item.cond));
            string target = branch == null ? scene.next : branch.target;
            if (!String.IsNullOrEmpty(target)) EnterScene(target, null, true);
            else
            {
                mode = PlayerMode.Ending;
                endingTitle = "剧情到此为止";
                canvas.Invalidate();
            }
        }

        public void SelectChoice(int index)
        {
            if (paused) return;
            skipping = automatic = false;
            if (mode != PlayerMode.Choices || VisibleChoices == null || index < 0 || index >= VisibleChoices.Count) return;
            ChoiceData choice = VisibleChoices[index];
            history.Add(CaptureSnapshot());
            EnterScene(choice.target, choice.setFlags, false);
        }

        public void GoBack()
        {
            if (paused) return;
            if (history.Count == 0) return;
            PlayerSnapshot snapshot = history[history.Count - 1];
            history.RemoveAt(history.Count - 1);
            RestoreSnapshot(snapshot);
        }

        private PlayerSnapshot CaptureSnapshot()
        {
            return new PlayerSnapshot {
                sceneId = scene == null ? "" : scene.id,
                dialogueIndex = dialogueIndex,
                flags = new Dictionary<string, double>(flags),
                readScenes = readScenes.ToList(),
                unlockedEndings = unlockedEndings.ToList(),
                mode = mode.ToString(),
                endingTitle = endingTitle
            };
        }

        private void RestoreSnapshot(PlayerSnapshot snapshot)
        {
            if (snapshot == null || !project.scenes.Any(s => s.id == snapshot.sceneId)) throw new InvalidDataException("存档场景不存在");
            paused = skipping = automatic = false; ResetTiming();
            scene = project.scenes.FirstOrDefault(item => item.id == snapshot.sceneId);
            dialogueIndex = snapshot.dialogueIndex;
            flags.Clear();
            if (snapshot.flags != null) foreach (KeyValuePair<string, double> pair in snapshot.flags) flags[pair.Key] = pair.Value;
            readScenes.Clear();
            if (snapshot.readScenes != null) foreach (string item in snapshot.readScenes) readScenes.Add(item);
            unlockedEndings.Clear();
            if (snapshot.unlockedEndings != null) foreach (string item in snapshot.unlockedEndings) unlockedEndings.Add(item);
            PlayerMode parsed;
            mode = Enum.TryParse<PlayerMode>(snapshot.mode, out parsed) ? parsed : PlayerMode.Playing;
            endingTitle = snapshot.endingTitle ?? "";
            VisibleChoices = mode == PlayerMode.Choices && scene != null ? scene.choices.Where(item => Evaluate(item.cond)).ToList() : new List<ChoiceData>();
            loggedLineKey = mode == PlayerMode.Playing ? CurrentLineKey() : "";
            foreach (string item in readScenes) visitedAll.Add(item);
            SyncGalleryUnlocks();
            SaveProgressState(false);
            canvas.SceneChanged();
            canvas.Invalidate();
        }

        private void SaveProgress()
        {
            if (scene == null || mode == PlayerMode.Title) return;
            File.WriteAllText(SavePath(0), Json.Create().Serialize(CaptureSnapshot()), new UTF8Encoding(false));
            canvas.ShowNotice("进度已保存");
        }

        private void LoadProgress()
        {
            string path = SavePath(0);
            if (!File.Exists(path)) { canvas.ShowNotice("还没有保存记录"); return; }
            RestoreSnapshot(Json.Create().Deserialize<PlayerSnapshot>(File.ReadAllText(path, Encoding.UTF8)));
            canvas.ShowNotice("进度已读取");
        }

        public void ContinueGame()
        {
            if (AutosaveEnabled && File.Exists(AutosaveFilePath))
            {
                try
                {
                    RestoreSnapshot(Json.Create().Deserialize<PlayerSnapshot>(File.ReadAllText(AutosaveFilePath, Encoding.UTF8)));
                    canvas.ShowNotice("已读取自动存档");
                    return;
                }
                catch (Exception ex) { canvas.ShowNotice("自动存档读取失败：" + ex.Message); }
            }
            string path = Enumerable.Range(0, 13).Select(i => SavePath(i)).Where(File.Exists).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
            if (path == null) { OpenSlots(true); return; }
            try { RestoreSnapshot(Json.Create().Deserialize<PlayerSnapshot>(File.ReadAllText(path, Encoding.UTF8))); canvas.ShowNotice("已读取存档"); }
            catch (Exception ex) { canvas.ShowNotice("读取失败：" + ex.Message); }
        }
        public void OpenSlots(bool loading)
        {
            bool wasPaused = paused; paused = true; skipping = automatic = false;
            using (Form dialog = new Form())
            {
                dialog.Text = loading ? "读取存档" : "保存进度"; dialog.Size = new Size(540, 470); dialog.StartPosition = FormStartPosition.CenterParent;
                FlowLayoutPanel list = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true };
                dialog.Controls.Add(list);
                for (int i = 1; i <= 12; i++)
                {
                    int slot = i; string path = SavePath(slot);
                    Button button = new Button { Width = 490, Height = 48, Text = "存档 " + slot + " · " + (File.Exists(path) ? File.GetLastWriteTime(path).ToString() : "空") };
                    button.Click += delegate {
                        try {
                            if (loading) { if (!File.Exists(path)) return; RestoreSnapshot(Json.Create().Deserialize<PlayerSnapshot>(File.ReadAllText(path, Encoding.UTF8))); wasPaused = false; }
                            else { if (scene == null || mode == PlayerMode.Title) return; File.WriteAllText(path, Json.Create().Serialize(CaptureSnapshot()), new UTF8Encoding(false)); }
                            dialog.Close();
                        } catch (Exception ex) { MessageBox.Show(dialog, ex.Message, "存档失败"); }
                    };
                    list.Controls.Add(button);
                }
                dialog.ShowDialog(this);
            }
            paused = wasPaused; clock.Restart();
        }

        private void ApplyOperations(IEnumerable<FlagOperationData> operations)
        {
            if (operations == null) return;
            foreach (FlagOperationData operation in operations)
            {
                if (operation == null || String.IsNullOrEmpty(operation.flag)) continue;
                double current;
                if (!flags.TryGetValue(operation.flag, out current)) current = 0;
                string op = operation.op ?? "=";
                if (op == "+") current += operation.value;
                else if (op == "-") current -= operation.value;
                else if (op == "*") current *= operation.value;
                else if (op == "/") { if (Math.Abs(operation.value) > .0000001) current /= operation.value; }
                else current = operation.value;
                flags[operation.flag] = Math.Round(current, 3);
            }
        }

        private bool Evaluate(string expression)
        {
            if (String.IsNullOrWhiteSpace(expression)) return true;
            try { return new ConditionParser(expression, flags, readScenes, project.scenes.Count, unlockedEndings).ParseBoolean(); }
            catch { return false; }
        }

        private List<DialogueData> CurrentDialogues()
        {
            if (scene == null) return new List<DialogueData>();
            if (scene.dialogues != null && scene.dialogues.Count > 0) return scene.dialogues;
            if (!String.IsNullOrWhiteSpace(scene.text)) return new List<DialogueData> { new DialogueData { speaker = scene.speaker ?? "", text = scene.text } };
            return new List<DialogueData>();
        }

        public string DisplayText(string value)
        {
            return Regex.Replace(value ?? "", "\\{([^}]+)\\}", delegate(Match match) {
                string key = match.Groups[1].Value.Trim();
                double number;
                return flags.TryGetValue(key, out number) ? number.ToString("0.###", CultureInfo.InvariantCulture) : match.Value;
            });
        }

        public VisualInfo ResolveVisual(SceneCharacterData character)
        {
            if (character == null) return new VisualInfo();
            LibraryCharacterData library = String.IsNullOrEmpty(character.charId) ? null : project.characters.FirstOrDefault(item => item.id == character.charId);
            if (library == null) return new VisualInfo { Name = character.name ?? "角色", Source = character.image ?? "" };
            DialogueData dialogue = CurrentDialogue;
            string actionId = dialogue != null && dialogue.charId == character.id && !String.IsNullOrEmpty(dialogue.actionId) ? dialogue.actionId : character.actionId;
            string expressionId = dialogue != null && dialogue.charId == character.id && !String.IsNullOrEmpty(dialogue.expressionId) ? dialogue.expressionId : character.expressionId;
            CharacterImageData expression = library.expressions.FirstOrDefault(item => item.id == expressionId);
            CharacterActionData action = library.actions.FirstOrDefault(item => item.id == actionId);
            string source = expression != null && !String.IsNullOrEmpty(expression.image) ? expression.image : (action != null && !String.IsNullOrEmpty(action.image) ? action.image : library.baseImage);
            return new VisualInfo { Name = library.name ?? character.name ?? "角色", Source = source ?? "" };
        }

        public bool IsSpeaking(SceneCharacterData character)
        {
            DialogueData dialogue = CurrentDialogue;
            if (dialogue == null || character == null) return false;
            if (!String.IsNullOrEmpty(dialogue.charId)) return dialogue.charId == character.id;
            return !String.IsNullOrEmpty(dialogue.speaker) && (dialogue.speaker == character.name || dialogue.speaker == ResolveVisual(character).Name);
        }

        private static double ConvertNumber(object value)
        {
            if (value == null) return 0;
            try { return Convert.ToDouble(value, CultureInfo.InvariantCulture); } catch { return 0; }
        }

        private void ToggleFullscreen()
        {
            if (!fullscreen)
            {
                previousBorder = FormBorderStyle;
                previousState = WindowState;
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Maximized;
                fullscreen = true;
            }
            else
            {
                FormBorderStyle = previousBorder;
                WindowState = previousState;
                fullscreen = false;
            }
        }

        private void OnGameKeyDown(object sender, KeyEventArgs e)
        {
            if (openingVisible) { SkipOpening(); e.Handled = true; return; }
            if (e.KeyCode == Keys.F11) { ToggleFullscreen(); e.Handled = true; return; }
            if (Overlay != PlayerOverlay.None)
            {
                if (e.KeyCode == Keys.Escape || e.KeyCode == Keys.S || e.KeyCode == Keys.L || e.KeyCode == Keys.H) { CloseOverlay(); e.Handled = true; }
                return;
            }
            if (uiHidden)
            {
                if (e.KeyCode == Keys.H || e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter || e.KeyCode == Keys.Escape) { HideUi(false); e.Handled = true; }
                return;
            }
            if (mode == PlayerMode.Title || mode == PlayerMode.Ending)
            {
                if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter) { StartGame(); e.Handled = true; }
                return;
            }
            if (mode == PlayerMode.Choices && e.KeyCode >= Keys.D1 && e.KeyCode <= Keys.D9)
            {
                SelectChoice((int)e.KeyCode - (int)Keys.D1); e.Handled = true; return;
            }
            if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter) { Advance(); e.Handled = true; }
            else if (e.KeyCode == Keys.Back) { GoBack(); e.Handled = true; }
            else if (e.KeyCode == Keys.Escape && fullscreen) { ToggleFullscreen(); e.Handled = true; }
            else if (e.KeyCode == Keys.S) { OpenOverlay(PlayerOverlay.Settings); e.Handled = true; }
            else if (e.KeyCode == Keys.L) { OpenOverlay(PlayerOverlay.Backlog); e.Handled = true; }
            else if (e.KeyCode == Keys.H) { HideUi(true); e.Handled = true; }
        }

        public void CaptureOnShown(string path)
        {
            Shown += delegate {
                StartGame();
                Timer timer = new Timer();
                timer.Interval = 700;
                timer.Tick += delegate {
                    timer.Stop();
                    string parent = Path.GetDirectoryName(Path.GetFullPath(path));
                    if (!Directory.Exists(parent)) Directory.CreateDirectory(parent);
                    using (Bitmap image = new Bitmap(ClientSize.Width, ClientSize.Height))
                    {
                        DrawToBitmap(image, new Rectangle(Point.Empty, ClientSize));
                        image.Save(path, ImageFormat.Png);
                    }
                    Close();
                };
                timer.Start();
            };
        }
    }

    internal sealed class GameCanvas : Control
    {
        private readonly GameForm game;
        private readonly ImageCache images = new ImageCache();
        private readonly List<RectangleF> choiceRects = new List<RectangleF>();
        private readonly List<RectangleF> overlayRects = new List<RectangleF>();
        private readonly List<int> overlayActions = new List<int>();
        private readonly List<int> overlayPayloads = new List<int>();
        private string notice = "";
        private DateTime noticeUntil;

        public GameCanvas(GameForm owner)
        {
            game = owner;
            BackColor = Color.FromArgb(18, 20, 29);
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            TabStop = true;
        }

        public void SceneChanged() { Invalidate(); }
        public void ShowNotice(string value) { notice = value; noticeUntil = DateTime.Now.AddSeconds(1.8); Invalidate(); }

        protected override void Dispose(bool disposing)
        {
            if (disposing) images.Dispose();
            base.Dispose(disposing);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            Rectangle bounds = ClientRectangle;
            if (game.Mode == PlayerMode.Title) DrawTitle(g, bounds);
            else
            {
                DrawScene(g, bounds);
                if (game.Mode == PlayerMode.Ending) DrawEnding(g, bounds);
                else if (!game.UiHidden) DrawDialogueAndChoices(g, bounds);
            }
            if (!String.IsNullOrEmpty(notice) && DateTime.Now < noticeUntil) DrawNotice(g, bounds);
            if (game.Overlay == PlayerOverlay.Settings) DrawSettingsOverlay(g, bounds);
            else if (game.Overlay == PlayerOverlay.Backlog) DrawBacklogOverlay(g, bounds);
            else if (game.Overlay == PlayerOverlay.Gallery) DrawGalleryOverlay(g, bounds);
            else if (game.Overlay == PlayerOverlay.Chapters) DrawChaptersOverlay(g, bounds);
            if (game.OpeningVisible) DrawOpening(g, bounds);
        }

        private sealed class TitleButtonItem
        {
            public HomeMenuItem Item;
            public RectangleF Rect;
            public TitleButtonItem(HomeMenuItem item, RectangleF rect) { Item = item; Rect = rect; }
        }

        private List<TitleButtonItem> TitleButtonLayout(Rectangle bounds)
        {
            List<TitleButtonItem> list = new List<TitleButtonItem>();
            IList<HomeMenuItem> items = game.HomeMenuItems();
            if (items == null || items.Count == 0) return list;
            float width = Math.Min(220f, bounds.Width * .24f);
            float height = 52f;
            int fallbackRow = 0;
            foreach (HomeMenuItem item in items)
            {
                RectangleF rect;
                MenuPosition pos = game.MenuPositionOf(item.Key);
                if (pos != null)
                {
                    float centerX = (float)(bounds.Width * pos.x / 100.0);
                    float centerY = (float)(bounds.Height * pos.y / 100.0);
                    rect = new RectangleF(centerX - width / 2, centerY - height / 2, width, height);
                }
                else
                {
                    rect = new RectangleF(bounds.Width / 2f - width / 2, bounds.Height * .61f + 62 * fallbackRow, width, height);
                    fallbackRow++;
                }
                list.Add(new TitleButtonItem(item, rect));
            }
            return list;
        }

        private void DrawTitle(Graphics g, Rectangle bounds)
        {
            HomeData home = game.Project.home;
            g.Clear(ParseColor(home.backgroundColor, Color.Black));
            Image image = images.Get(home.background); if (image != null) DrawCover(g, image, bounds);
            Image logo = images.Get(home.logo);
            bool hasLogo = logo != null;
            float titleTop = bounds.Height * .3f;
            float subtitleTop = bounds.Height * .47f;
            if (hasLogo)
            {
                float maxHeight = Math.Min(150f, bounds.Height * .16f);
                float maxWidth = bounds.Width * .52f;
                float targetHeight = maxHeight;
                float aspect = logo.Width / (float)Math.Max(1f, logo.Height);
                if (aspect * targetHeight > maxWidth) targetHeight = maxWidth / aspect;
                float top = bounds.Height * .06f;
                float logoWidth = targetHeight * aspect;
                float logoX = bounds.Width * .5f - logoWidth / 2;
                using (ImageAttributes attributes = new ImageAttributes())
                {
                    g.DrawImage(logo, Rectangle.Round(new RectangleF(logoX, top, logoWidth, targetHeight)), 0, 0, logo.Width, logo.Height, GraphicsUnit.Pixel, attributes);
                }
                float logoBottom = top + targetHeight;
                titleTop = Math.Max(titleTop, logoBottom + bounds.Height * .04f);
                subtitleTop = Math.Max(subtitleTop, titleTop + bounds.Height * .12f);
            }
            RectangleF titleRect = new RectangleF(bounds.Width * .1f, titleTop, bounds.Width * .8f, 100);
            using (Font titleFont = new Font("Microsoft YaHei UI", Math.Max(28, bounds.Width / 32f), FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(ParseColor(home.textColor, Color.White)))
                DrawCentered(g, home.title, titleFont, white, titleRect);
            RectangleF subRect = new RectangleF(bounds.Width * .2f, subtitleTop, bounds.Width * .6f, 42);
            using (Font subFont = new Font("Microsoft YaHei UI", 15, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush muted = new SolidBrush(Color.FromArgb(188, 195, 217)))
                DrawCentered(g, home.subtitle, subFont, muted, subRect);
            List<TitleButtonItem> buttons = TitleButtonLayout(bounds);
            foreach (TitleButtonItem entry in buttons)
            {
                RectangleF rect = entry.Rect;
                Color fill = entry.Item.Enabled ? ParseColor(home.accentColor, Color.HotPink) : Color.FromArgb(110, 84, 90);
                FillRoundRect(g, rect, 8, fill);
                using (Pen pen = new Pen(Color.FromArgb(120, 251, 114, 153), 1.2f)) DrawRoundRect(g, pen, rect, 8);
                bool primary = entry.Item.Key == "start";
                using (Font font = new Font("Microsoft YaHei UI", primary ? 17 : 15, primary ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel))
                using (Brush brush = new SolidBrush(ParseColor(home.textColor, Color.White)))
                    DrawCentered(g, entry.Item.Label, font, brush, rect);
            }
            RectangleF hint = new RectangleF(bounds.Width * .16f, Math.Min(bounds.Height * .88f, buttons.Count > 0 ? buttons[buttons.Count - 1].Rect.Bottom + 24 : bounds.Height * .8f), bounds.Width * .68f, 26);
            using (Font hintFont = new Font("Microsoft YaHei UI", 11, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush muted = new SolidBrush(Color.FromArgb(135, 145, 168)))
                DrawCentered(g, "Space / Enter 开始游戏 · S 设置 · 单击按钮进入对应功能", hintFont, muted, hint);
        }

        private void DrawOpening(Graphics g, Rectangle bounds)
        {
            OpeningData opening = game.Project.experience.opening;
            using (Brush shade = new SolidBrush(Color.FromArgb(255, 16, 18, 27))) g.FillRectangle(shade, bounds);
            Image frame = opening == null ? null : images.Get(opening.image);
            float alpha = (float)Math.Max(0, Math.Min(1, game.OpeningAlpha));
            if (frame != null)
            {
                GraphicsState state = g.Save();
                using (ImageAttributes attributes = new ImageAttributes())
                {
                    ColorMatrix matrix = new ColorMatrix();
                    matrix.Matrix33 = alpha;
                    attributes.SetColorMatrix(matrix, ColorMatrixFlag.Default, ColorAdjustType.Bitmap);
                    RectangleF destination = FitCover(bounds, frame.Width, frame.Height);
                    g.DrawImage(frame, Rectangle.Round(destination), 0, 0, frame.Width, frame.Height, GraphicsUnit.Pixel, attributes);
                }
                g.Restore(state);
            }
            using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(Color.FromArgb((int)(alpha * 255), 255, 255, 255)))
            {
                RectangleF hint = new RectangleF(bounds.Width * .2f, bounds.Height * .86f, bounds.Width * .6f, 30);
                DrawCentered(g, "单击或按任意键跳过开场", font, white, hint);
            }
        }

        private static RectangleF FitCover(Rectangle bounds, float imageWidth, float imageHeight)
        {
            float scale = Math.Max(bounds.Width / imageWidth, bounds.Height / imageHeight);
            float width = imageWidth * scale, height = imageHeight * scale;
            return new RectangleF((bounds.Width - width) / 2, (bounds.Height - height) / 2, width, height);
        }

        private void DrawScene(Graphics g, Rectangle bounds)
        {
            SceneData scene = game.CurrentScene;
            Color color = ParseColor(scene == null ? "#181B26" : scene.bg, Color.FromArgb(24, 27, 38));
            g.Clear(color);
            if (scene == null) return;
            Image background = images.Get(scene.bgImage);
            if (background != null) DrawCover(g, background, bounds);
            using (LinearGradientBrush shade = new LinearGradientBrush(bounds, Color.FromArgb(0, 0, 0, 0), Color.FromArgb(105, 0, 0, 0), LinearGradientMode.Vertical)) g.FillRectangle(shade, bounds);
            DrawCharacters(g, bounds, scene);
        }

        private void DrawCharacters(Graphics g, Rectangle bounds, SceneData scene)
        {
            if (scene.characters == null) return;
            bool hasSpeaking = scene.characters.Any(game.IsSpeaking);
            foreach (SceneCharacterData character in scene.characters)
            {
                VisualInfo visual = game.ResolveVisual(character);
                Image image = images.Get(visual.Source);
                float anchorX = (float)(bounds.Width * (character.x ?? 50) / 100.0);
                float anchorY = (float)(bounds.Height * (character.y ?? 88) / 100.0);
                float targetHeight = (float)(bounds.Height * .58 * Math.Max(.2, character.scale ?? 1));
                bool speaking = game.IsSpeaking(character);
                float alpha = (float)Math.Max(0, Math.Min(1, (character.opacity ?? 1) * (hasSpeaking && !speaking ? .48 : 1)));
                if (image == null)
                {
                    RectangleF placeholder = new RectangleF(anchorX - 90, anchorY - targetHeight, 180, targetHeight);
                    FillRoundRect(g, placeholder, 14, Color.FromArgb((int)(alpha * 160), 255, 255, 255));
                    using (Pen pen = new Pen(Color.FromArgb(220, 251, 114, 153), 2)) DrawRoundRect(g, pen, placeholder, 14);
                    using (Font font = new Font("Microsoft YaHei UI", 15, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (Brush brush = new SolidBrush(Color.FromArgb(40, 43, 55))) DrawCentered(g, visual.Name, font, brush, placeholder);
                    continue;
                }
                float targetWidth = targetHeight * image.Width / Math.Max(1f, image.Height);
                RectangleF destination = new RectangleF(-targetWidth / 2, -targetHeight, targetWidth, targetHeight);
                GraphicsState state = g.Save();
                g.TranslateTransform(anchorX, anchorY);
                g.RotateTransform((float)(character.rotate ?? 0));
                using (ImageAttributes attributes = new ImageAttributes())
                {
                    ColorMatrix matrix = new ColorMatrix(); matrix.Matrix33 = alpha;
                    attributes.SetColorMatrix(matrix, ColorMatrixFlag.Default, ColorAdjustType.Bitmap);
                    g.DrawImage(image, Rectangle.Round(destination), 0, 0, image.Width, image.Height, GraphicsUnit.Pixel, attributes);
                }
                g.Restore(state);
            }
        }

        private void DrawDialogueAndChoices(Graphics g, Rectangle bounds)
        {
            choiceRects.Clear();
            UiData ui = game.Project.ui;
            DialogueData dialogue = game.CurrentDialogue;
            if (dialogue != null && ui.textbox.show)
            {
                RectangleF panel = new RectangleF(bounds.Width * .07f, bounds.Height - 205, bounds.Width * .86f, 170);
                Color panelColor = WithAlpha(ParseColor(ui.textbox.bg, Color.FromArgb(17, 24, 39)), ui.textbox.opacity ?? .9);
                FillRoundRect(g, panel, 13, panelColor);
                using (Pen border = new Pen(ParseColor(ui.textbox.border, Color.FromArgb(251, 114, 153)), 1.4f)) DrawRoundRect(g, border, panel, 13);
                if (!String.IsNullOrEmpty(dialogue.speaker) && ui.speaker.show)
                {
                    RectangleF badge = new RectangleF(panel.X + 22, panel.Y - 17, Math.Min(260, 42 + dialogue.speaker.Length * 18), 34);
                    FillRoundRect(g, badge, 17, ParseColor(ui.speaker.bg, Color.FromArgb(251, 114, 153)));
                    using (Font speakerFont = new Font("Microsoft YaHei UI", ui.speaker.fontSize > 0 ? ui.speaker.fontSize : 14, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (Brush speakerBrush = new SolidBrush(ParseColor(ui.speaker.color, Color.White))) DrawCentered(g, dialogue.speaker, speakerFont, speakerBrush, badge);
                }
                RectangleF textRect = new RectangleF(panel.X + 25, panel.Y + 32, panel.Width - 50, panel.Height - 58);
                using (Font textFont = new Font("Microsoft YaHei UI", ui.textbox.fontSize > 0 ? ui.textbox.fontSize : 20, FontStyle.Regular, GraphicsUnit.Pixel))
                using (Brush textBrush = new SolidBrush(ParseColor(ui.textbox.fontColor, Color.White)))
                    g.DrawString(game.VisibleText, textFont, textBrush, textRect, TextFormat());
                using (Font hint = new Font("Microsoft YaHei UI", 11, FontStyle.Regular, GraphicsUnit.Pixel))
                using (Brush muted = new SolidBrush(Color.FromArgb(165, 176, 198)))
                    g.DrawString("单击继续", hint, muted, panel.Right - 78, panel.Bottom - 25);
            }
            if (game.Mode == PlayerMode.Choices && game.VisibleChoices != null) DrawChoices(g, bounds, game.VisibleChoices);
        }

        private void DrawChoices(Graphics g, Rectangle bounds, IList<ChoiceData> choices)
        {
            UiData ui = game.Project.ui;
            if (!ui.choices.show) return;
            float width = Math.Min(680, bounds.Width * .66f);
            float height = 54;
            float gap = 12;
            float total = choices.Count * height + Math.Max(0, choices.Count - 1) * gap;
            float top = Math.Max(70, bounds.Height * .34f - total / 2);
            for (int i = 0; i < choices.Count; i++)
            {
                RectangleF rect = new RectangleF((bounds.Width - width) / 2, top + i * (height + gap), width, height);
                choiceRects.Add(rect);
                FillRoundRect(g, rect, 10, WithAlpha(ParseColor(ui.choices.bg, Color.White), ui.choices.opacity ?? .94));
                using (Pen border = new Pen(ParseColor(ui.choices.border, Color.FromArgb(251, 114, 153)), 1.6f)) DrawRoundRect(g, border, rect, 10);
                using (Font font = new Font("Microsoft YaHei UI", ui.choices.fontSize > 0 ? ui.choices.fontSize : 16, FontStyle.Bold, GraphicsUnit.Pixel))
                using (Brush brush = new SolidBrush(ParseColor(ui.choices.color, Color.FromArgb(199, 92, 126))))
                    DrawCentered(g, (i + 1).ToString() + "  " + game.DisplayText(choices[i].text), font, brush, rect);
            }
        }

        private void DrawEnding(Graphics g, Rectangle bounds)
        {
            using (Brush overlay = new SolidBrush(Color.FromArgb(205, 16, 18, 27))) g.FillRectangle(overlay, bounds);
            RectangleF label = new RectangleF(bounds.Width * .18f, bounds.Height * .28f, bounds.Width * .64f, 40);
            using (Font small = new Font("Microsoft YaHei UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush pink = new SolidBrush(Color.FromArgb(251, 114, 153))) DrawCentered(g, "ENDING", small, pink, label);
            RectangleF title = new RectangleF(bounds.Width * .12f, bounds.Height * .38f, bounds.Width * .76f, 100);
            using (Font font = new Font("Microsoft YaHei UI", Math.Max(26, bounds.Width / 38f), FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(Color.White)) DrawCentered(g, game.EndingTitle, font, white, title);
            RectangleF hint = new RectangleF(bounds.Width * .2f, bounds.Height * .63f, bounds.Width * .6f, 36);
            using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush muted = new SolidBrush(Color.FromArgb(173, 181, 204))) DrawCentered(g, "单击重新开始", font, muted, hint);
        }

        private void DrawNotice(Graphics g, Rectangle bounds)
        {
            SizeF size;
            using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Bold, GraphicsUnit.Pixel)) size = g.MeasureString(notice, font);
            RectangleF box = new RectangleF((bounds.Width - size.Width - 36) / 2, 26, size.Width + 36, 38);
            FillRoundRect(g, box, 10, Color.FromArgb(235, 31, 34, 47));
            using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(Color.White)) DrawCentered(g, notice, font, white, box);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (game.OpeningVisible) { game.SkipOpening(); return; }
            if (game.Overlay != PlayerOverlay.None)
            {
                Focus();
                for (int i = 0; i < overlayRects.Count; i++)
                    if (overlayRects[i].Contains(e.Location)) { game.PerformOverlayAction((OverlayAction)overlayActions[i], overlayPayloads[i]); return; }
                return;
            }
            if (game.UiHidden && (game.Mode == PlayerMode.Playing || game.Mode == PlayerMode.Choices)) { game.HideUi(false); return; }
            if (game.Mode == PlayerMode.Title)
            {
                List<TitleButtonItem> buttons = TitleButtonLayout(ClientRectangle);
                foreach (TitleButtonItem entry in buttons)
                {
                    if (!entry.Rect.Contains(e.Location)) continue;
                    if (!entry.Item.Enabled) { ShowNotice("章节选择未启用（体验设置）"); return; }
                    switch (entry.Item.Key)
                    {
                        case "start": game.StartGame(); break;
                        case "continue": game.ContinueGame(); break;
                        case "load": game.OpenSlots(true); break;
                        case "gallery": game.OpenOverlay(PlayerOverlay.Gallery); break;
                        case "settings": game.OpenOverlay(PlayerOverlay.Settings); break;
                        case "chapters": game.OpenOverlay(PlayerOverlay.Chapters); break;
                    }
                    return;
                }
                return;
            }
            Focus();
            if (game.Mode == PlayerMode.Choices)
            {
                for (int i = 0; i < choiceRects.Count; i++) if (choiceRects[i].Contains(e.Location)) { game.SelectChoice(i); return; }
                return;
            }
            game.Advance();
        }

        private void RegisterOverlayZone(RectangleF rect, OverlayAction action)
        {
            RegisterOverlayZone(rect, action, -1);
        }

        private void RegisterOverlayZone(RectangleF rect, OverlayAction action, int payload)
        {
            overlayRects.Add(rect);
            overlayActions.Add((int)action);
            overlayPayloads.Add(payload);
        }

        private static RectangleF OverlayPanel(Rectangle bounds)
        {
            float width = Math.Min(700, bounds.Width * .8f);
            float height = Math.Min(bounds.Height * .84f, 600);
            return new RectangleF((bounds.Width - width) / 2, Math.Max(16, (bounds.Height - height) / 2 - 8), width, height);
        }

        private void DrawOverlayBackdrop(Graphics g, Rectangle bounds)
        {
            using (Brush dim = new SolidBrush(Color.FromArgb(218, 8, 10, 16))) g.FillRectangle(dim, bounds);
        }

        private static void DrawOverlayPanel(Graphics g, Rectangle bounds, out RectangleF panel)
        {
            panel = OverlayPanel(bounds);
            FillRoundRect(g, panel, 14, Color.FromArgb(252, 21, 24, 36));
            using (Pen border = new Pen(Color.FromArgb(251, 114, 153), 1.6f)) DrawRoundRect(g, border, panel, 14);
        }

        private void DrawOverlayClose(Graphics g, RectangleF panel, OverlayAction action)
        {
            float closeWidth = 160, closeHeight = 46;
            RectangleF close = new RectangleF(panel.Right - closeWidth - 24, panel.Bottom - closeHeight - 22, closeWidth, closeHeight);
            FillRoundRect(g, close, 9, Color.FromArgb(48, 53, 74));
            using (Pen pen = new Pen(Color.FromArgb(118, 130, 160), 1.3f)) DrawRoundRect(g, pen, close, 9);
            using (Font font = new Font("Microsoft YaHei UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(Color.White)) DrawCentered(g, "关闭", font, white, close);
            RegisterOverlayZone(close, action);
        }

        private static void DrawLockBadge(Graphics g, RectangleF rect)
        {
            float cx = rect.X + rect.Width / 2;
            float bodyTop = rect.Y + rect.Height * .52f;
            float bodyWidth = Math.Min(rect.Width * .5f, 26);
            float bodyHeight = Math.Min(rect.Height * .3f, 16);
            RectangleF body = new RectangleF(cx - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
            FillRoundRect(g, body, 4, Color.FromArgb(226, 226, 233));
            using (Pen pen = new Pen(Color.FromArgb(226, 226, 233), 2.4f))
            {
                g.DrawArc(pen, cx - bodyWidth * .28f, bodyTop - bodyHeight * .8f, bodyWidth * .56f, bodyHeight * .9f, 180, 180);
            }
        }

        private void DrawGalleryOverlay(Graphics g, Rectangle bounds)
        {
            overlayRects.Clear(); overlayActions.Clear(); overlayPayloads.Clear();
            DrawOverlayBackdrop(g, bounds);
            RectangleF panel;
            DrawOverlayPanel(g, bounds, out panel);
            string bucketKey = game.GalleryBucketKey;
            bool isMusic = bucketKey == "music";
            float x = panel.X + 26, top = panel.Y + 18;
            using (Font heading = new Font("Microsoft YaHei UI", 20, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush pink = new SolidBrush(Color.FromArgb(255, 141, 176)))
                g.DrawString("画廊", heading, pink, x, top);
            float tabY = top + 44;
            float tabWidth = (panel.Width - 52 - 3 * 10) / 4;
            float tabHeight = 40;
            for (int i = 0; i < GameForm.GalleryBucketKeys.Length; i++)
            {
                RectangleF tab = new RectangleF(x + i * (tabWidth + 10), tabY, tabWidth, tabHeight);
                bool active = i == game.GalleryBucketIndex;
                FillRoundRect(g, tab, 8, active ? Color.FromArgb(140, 251, 114, 153) : Color.FromArgb(48, 53, 74));
                using (Pen pen = new Pen(active ? Color.FromArgb(255, 141, 176) : Color.FromArgb(118, 130, 160), 1.2f)) DrawRoundRect(g, pen, tab, 8);
                using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Bold, GraphicsUnit.Pixel))
                using (Brush brush = new SolidBrush(active ? Color.White : Color.FromArgb(195, 203, 224)))
                    DrawCentered(g, GameForm.GalleryBucketLabels[i], font, brush, tab);
                RegisterOverlayZone(tab, OverlayAction.GalleryTab, i);
            }
            float listTop = tabY + tabHeight + 14;
            float listBottom = panel.Bottom - 72;
            float listWidth = panel.Width - 44;
            IList<CollectionEntry> entries = game.GalleryEntriesFor(bucketKey);
            int unlockedCount = 0;
            foreach (CollectionEntry entry in entries) if (entry != null && game.EntryUnlockedFor(bucketKey, entry)) unlockedCount++;
            if (entries.Count == 0)
            {
                using (Font font = new Font("Microsoft YaHei UI", 15, FontStyle.Regular, GraphicsUnit.Pixel))
                using (Brush gray = new SolidBrush(Color.FromArgb(148, 155, 178)))
                    g.DrawString("该分类暂无收藏条目", font, gray, x + 8, listTop + 10);
            }
            else
            {
                float gap = 12;
                int columns = listWidth >= 520 ? 3 : 2;
                float tileWidth = (listWidth - gap * (columns - 1)) / columns;
                float tileHeight = 122;
                int visibleRows = Math.Max(1, (int)((listBottom - listTop + gap) / (tileHeight + gap)));
                int totalRows = (entries.Count + columns - 1) / columns;
                int offset = Math.Min(game.GalleryScrollStep, Math.Max(0, totalRows - visibleRows));
                if (offset != game.GalleryScrollStep) game.GalleryScrollStep = offset;
                RectangleF clip = new RectangleF(panel.X + 22, listTop, listWidth, Math.Max(10, listBottom - listTop));
                GraphicsState state = g.Save();
                g.SetClip(clip);
                for (int row = offset; row < Math.Min(totalRows, offset + visibleRows); row++)
                {
                    for (int col = 0; col < columns; col++)
                    {
                        int entryIndex = row * columns + col;
                        if (entryIndex >= entries.Count) break;
                        CollectionEntry entry = entries[entryIndex];
                        if (entry == null) continue;
                        RectangleF tile = new RectangleF(clip.X + col * (tileWidth + gap), clip.Y + (row - offset) * (tileHeight + gap), tileWidth, tileHeight);
                        bool unlocked = game.EntryUnlockedFor(bucketKey, entry);
                        float alpha = (isMusic || !unlocked) ? .62f : 1f;
                        Color tileColor = unlocked ? Color.FromArgb(45, 51, 71) : Color.FromArgb(34, 38, 52);
                        FillRoundRect(g, tile, 10, tileColor);
                        using (Pen pen = new Pen(unlocked ? Color.FromArgb(251, 114, 153) : Color.FromArgb(86, 92, 112), 1.3f)) DrawRoundRect(g, pen, tile, 10);
                        RectangleF imageArea = new RectangleF(tile.X + 8, tile.Y + 8, tile.Width - 16, tile.Height - 46);
                        Image thumb = images.Get(entry.source);
                        if (thumb != null && unlocked)
                        {
                            GraphicsState imageState = g.Save();
                            g.SetClip(imageArea);
                            RectangleF dest = FitCover(Rectangle.Round(imageArea), thumb.Width, thumb.Height);
                            using (ImageAttributes attributes = new ImageAttributes())
                            {
                                ColorMatrix matrix = new ColorMatrix(); matrix.Matrix33 = alpha;
                                attributes.SetColorMatrix(matrix, ColorMatrixFlag.Default, ColorAdjustType.Bitmap);
                                g.DrawImage(thumb, Rectangle.Round(dest), 0, 0, thumb.Width, thumb.Height, GraphicsUnit.Pixel, attributes);
                            }
                            g.Restore(imageState);
                        }
                        else
                        {
                            Color placeholder = unlocked ? Color.FromArgb(58, 64, 86) : Color.FromArgb(46, 51, 68);
                            FillRoundRect(g, imageArea, 6, placeholder);
                            using (Font font = new Font("Microsoft YaHei UI", 12, FontStyle.Regular, GraphicsUnit.Pixel))
                            using (Brush brush = new SolidBrush(unlocked ? Color.FromArgb(150, 158, 180) : Color.FromArgb(112, 118, 140)))
                            {
                                if (!unlocked) DrawCentered(g, "未解锁", font, brush, imageArea);
                                else if (isMusic) DrawCentered(g, "♪", font, brush, imageArea);
                                else DrawCentered(g, bucketKey == "achievements" ? "成就" : "图片不可用", font, brush, imageArea);
                            }
                            if (!unlocked) DrawLockBadge(g, imageArea);
                        }
                        if (isMusic)
                        {
                            using (Font font = new Font("Microsoft YaHei UI", 11, FontStyle.Regular, GraphicsUnit.Pixel))
                            using (Brush brush = new SolidBrush(Color.FromArgb(190, 148, 155, 178)))
                                g.DrawString("音频不支持", font, brush, imageArea.X + 2, imageArea.Y + 2);
                        }
                        string title = entry.title ?? "";
                        using (Font font = new Font("Microsoft YaHei UI", 12, FontStyle.Bold, GraphicsUnit.Pixel))
                        using (Brush brush = new SolidBrush(unlocked ? Color.FromArgb(235, 238, 246) : Color.FromArgb(128, 134, 155)))
                        {
                            RectangleF titleRect = new RectangleF(tile.X + 8, tile.Bottom - 34, tile.Width - 16, 30);
                            DrawCentered(g, title, font, brush, titleRect);
                        }
                    }
                }
                g.Restore(state);
                if (totalRows > visibleRows)
                {
                    float arrowSize = 30;
                    RectangleF up = new RectangleF(panel.X + 22, panel.Bottom - 64, arrowSize, arrowSize);
                    RectangleF down = new RectangleF(panel.X + 58, panel.Bottom - 64, arrowSize, arrowSize);
                    bool canUp = offset > 0, canDown = offset + visibleRows < totalRows;
                    FillRoundRect(g, up, 7, canUp ? Color.FromArgb(64, 70, 92) : Color.FromArgb(40, 44, 60));
                    FillRoundRect(g, down, 7, canDown ? Color.FromArgb(64, 70, 92) : Color.FromArgb(40, 44, 60));
                    using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (Brush brush = new SolidBrush(Color.FromArgb(190, 200, 220)))
                    {
                        DrawCentered(g, "▲", font, brush, up);
                        DrawCentered(g, "▼", font, brush, down);
                    }
                    if (canUp) RegisterOverlayZone(up, OverlayAction.GalleryScrollUp);
                    if (canDown) RegisterOverlayZone(down, OverlayAction.GalleryScrollDown);
                }
            }
            using (Font noteFont = new Font("Microsoft YaHei UI", 11, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush gray = new SolidBrush(Color.FromArgb(148, 155, 178)))
            {
                string footer = "共 " + entries.Count + " 项 · 已解锁 " + unlockedCount + " 项" + (isMusic ? "　" + GameForm.MusicUnsupportedMessage : "　·　单击「关闭」或按 Esc / S / L / H 返回");
                RectangleF noteRect = new RectangleF(x + 8, panel.Bottom - 56, Math.Max(40, panel.Width - 230), 44);
                g.DrawString(footer, noteFont, gray, noteRect, TextFormat());
            }
            DrawOverlayClose(g, panel, OverlayAction.Close);
        }

        private void DrawChaptersOverlay(Graphics g, Rectangle bounds)
        {
            overlayRects.Clear(); overlayActions.Clear(); overlayPayloads.Clear();
            DrawOverlayBackdrop(g, bounds);
            RectangleF panel;
            DrawOverlayPanel(g, bounds, out panel);
            bool enabled = game.ChapterSelectionEnabled;
            float x = panel.X + 26, top = panel.Y + 18;
            using (Font heading = new Font("Microsoft YaHei UI", 20, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush pink = new SolidBrush(Color.FromArgb(255, 141, 176)))
                g.DrawString("章节选择", heading, pink, x, top);
            IList<CollectionEntry> chapters = game.Chapters;
            float listTop = top + 50;
            float listBottom = panel.Bottom - 72;
            float rowHeight = 46;
            int visibleRows = Math.Max(1, (int)((listBottom - listTop) / rowHeight));
            int totalRows = chapters.Count;
            int offset = Math.Min(game.ChaptersScrollStep, Math.Max(0, totalRows - visibleRows));
            if (offset != game.ChaptersScrollStep) game.ChaptersScrollStep = offset;
            RectangleF clip = new RectangleF(panel.X + 22, listTop, panel.Width - 44, Math.Max(10, listBottom - listTop));
            GraphicsState state = g.Save();
            g.SetClip(clip);
            if (chapters.Count == 0)
            {
                using (Font font = new Font("Microsoft YaHei UI", 15, FontStyle.Regular, GraphicsUnit.Pixel))
                using (Brush gray = new SolidBrush(Color.FromArgb(148, 155, 178)))
                    g.DrawString("作者尚未设置章节", font, gray, clip.X + 8, clip.Y + 10);
            }
            else
            {
                for (int i = offset; i < Math.Min(chapters.Count, offset + visibleRows); i++)
                {
                    CollectionEntry chapter = chapters[i];
                    if (chapter == null) continue;
                    RectangleF row = new RectangleF(clip.X + 2, clip.Y + (i - offset) * rowHeight, clip.Width - 4, rowHeight - 6);
                    string sceneId = chapter.sceneId ?? "";
                    bool available = enabled && game.IsChapterSceneAvailable(sceneId);
                    bool sceneExists = !String.IsNullOrEmpty(sceneId) && game.Project.scenes.Any(item => item.id == sceneId);
                    Color fill = available ? Color.FromArgb(120, 251, 114, 153) : Color.FromArgb(46, 51, 68);
                    FillRoundRect(g, row, 8, fill);
                    using (Pen pen = new Pen(available ? Color.FromArgb(255, 141, 176) : Color.FromArgb(90, 97, 118), 1.2f)) DrawRoundRect(g, pen, row, 8);
                    using (Font font = new Font("Microsoft YaHei UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (Brush brush = new SolidBrush(available ? Color.White : Color.FromArgb(150, 156, 176)))
                        g.DrawString(chapter.title ?? "", font, brush, row.X + 14, row.Y + row.Height / 2 - 10);
                    string status;
                    if (!enabled) status = "未启用";
                    else if (!sceneExists) status = "场景不存在";
                    else if (!game.HasReadScene(sceneId)) status = "未读过该场景";
                    else status = "可跳转";
                    using (Font font = new Font("Microsoft YaHei UI", 12, FontStyle.Regular, GraphicsUnit.Pixel))
                    using (Brush brush = new SolidBrush(available ? Color.FromArgb(255, 200, 215, 235) : Color.FromArgb(120, 128, 150)))
                        g.DrawString(status, font, brush, row.Right - 96, row.Y + row.Height / 2 - 8);
                    if (available) RegisterOverlayZone(row, OverlayAction.ChapterJump, i);
                }
            }
            g.Restore(state);
            if (chapters.Count > visibleRows)
            {
                float arrowSize = 30;
                RectangleF up = new RectangleF(panel.X + 22, panel.Bottom - 64, arrowSize, arrowSize);
                RectangleF down = new RectangleF(panel.X + 58, panel.Bottom - 64, arrowSize, arrowSize);
                bool canUp = offset > 0, canDown = offset + visibleRows < totalRows;
                FillRoundRect(g, up, 7, canUp ? Color.FromArgb(64, 70, 92) : Color.FromArgb(40, 44, 60));
                FillRoundRect(g, down, 7, canDown ? Color.FromArgb(64, 70, 92) : Color.FromArgb(40, 44, 60));
                using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Bold, GraphicsUnit.Pixel))
                using (Brush brush = new SolidBrush(Color.FromArgb(190, 200, 220)))
                {
                    DrawCentered(g, "▲", font, brush, up);
                    DrawCentered(g, "▼", font, brush, down);
                }
                if (canUp) RegisterOverlayZone(up, OverlayAction.ChaptersScrollUp);
                if (canDown) RegisterOverlayZone(down, OverlayAction.ChaptersScrollDown);
            }
            using (Font noteFont = new Font("Microsoft YaHei UI", 11, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush gray = new SolidBrush(Color.FromArgb(148, 155, 178)))
            {
                RectangleF noteRect = new RectangleF(x + 8, panel.Bottom - 56, Math.Max(40, panel.Width - 230), 44);
                g.DrawString(enabled ? "只能跳转到本次游玩中已读过的场景" : "章节选择未启用（作者在「体验 → 进度设置」中关闭）", noteFont, gray, noteRect, TextFormat());
            }
            DrawOverlayClose(g, panel, OverlayAction.Close);
        }

        private void DrawSettingsOverlay(Graphics g, Rectangle bounds)
        {
            overlayRects.Clear(); overlayActions.Clear(); overlayPayloads.Clear();
            DrawOverlayBackdrop(g, bounds);
            RectangleF panel = OverlayPanel(bounds);
            FillRoundRect(g, panel, 14, Color.FromArgb(252, 21, 24, 36));
            using (Pen border = new Pen(Color.FromArgb(251, 114, 153), 1.6f)) DrawRoundRect(g, border, panel, 14);
            float x = panel.X + 26, y = panel.Y + 20, width = panel.Width - 52;
            using (Font heading = new Font("Microsoft YaHei UI", 20, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush pink = new SolidBrush(Color.FromArgb(255, 141, 176))) g.DrawString("设置", heading, pink, x, y);
            y += 48;
            using (Font rowFont = new Font("Microsoft YaHei UI", 15, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush labelBrush = new SolidBrush(Color.FromArgb(225, 229, 240)))
                g.DrawString("文字速度（当前：" + game.TextSpeedLabel() + "）", rowFont, labelBrush, x, y);
            y += 36;
            string[] speedOptions = { "慢 (60)", "标准 (30)", "快 (15)", "立即 (0)" };
            double[] speedValues = { 60, 30, 15, 0 };
            OverlayAction[] speedActions = { OverlayAction.SpeedSlow, OverlayAction.SpeedStandard, OverlayAction.SpeedFast, OverlayAction.SpeedInstant };
            float chipHeight = 42, gap = 10;
            float chipWidth = (width - gap * (speedOptions.Length - 1)) / speedOptions.Length;
            for (int i = 0; i < speedOptions.Length; i++)
            {
                RectangleF chip = new RectangleF(x + i * (chipWidth + gap), y, chipWidth, chipHeight);
                bool selected = Math.Abs(game.TextSpeed - speedValues[i]) < .001;
                FillRoundRect(g, chip, 9, selected ? Color.FromArgb(125, 251, 114, 153) : Color.FromArgb(48, 53, 74));
                using (Pen pen = new Pen(selected ? Color.FromArgb(255, 141, 176) : Color.FromArgb(118, 130, 160), 1.4f)) DrawRoundRect(g, pen, chip, 9);
                using (Font font = new Font("Microsoft YaHei UI", 13, FontStyle.Bold, GraphicsUnit.Pixel))
                using (Brush brush = new SolidBrush(selected ? Color.White : Color.FromArgb(195, 203, 224))) DrawCentered(g, speedOptions[i], font, brush, chip);
                RegisterOverlayZone(chip, speedActions[i]);
            }
            y += chipHeight + 34;
            using (Font rowFont = new Font("Microsoft YaHei UI", 15, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush gray = new SolidBrush(Color.FromArgb(148, 155, 178)))
            {
                g.DrawString("音量：本机播放器不支持音频输出，此项不可用（原生版无音频功能）", rowFont, gray, x, y);
                y += 30;
                g.DrawString("快捷键：S 设置 · L 记录 · H 隐藏界面 · Esc 关闭", rowFont, gray, x, y);
            }
            float closeWidth = 160, closeHeight = 46;
            RectangleF close = new RectangleF(panel.Right - closeWidth - 24, panel.Bottom - closeHeight - 22, closeWidth, closeHeight);
            FillRoundRect(g, close, 9, Color.FromArgb(48, 53, 74));
            using (Pen pen = new Pen(Color.FromArgb(118, 130, 160), 1.3f)) DrawRoundRect(g, pen, close, 9);
            using (Font font = new Font("Microsoft YaHei UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(Color.White)) DrawCentered(g, "关闭", font, white, close);
            RegisterOverlayZone(close, OverlayAction.Close);
        }

        private void DrawBacklogOverlay(Graphics g, Rectangle bounds)
        {
            overlayRects.Clear(); overlayActions.Clear(); overlayPayloads.Clear();
            DrawOverlayBackdrop(g, bounds);
            RectangleF panel = OverlayPanel(bounds);
            FillRoundRect(g, panel, 14, Color.FromArgb(252, 21, 24, 36));
            using (Pen border = new Pen(Color.FromArgb(251, 114, 153), 1.6f)) DrawRoundRect(g, border, panel, 14);
            float x = panel.X + 26, y = panel.Y + 20;
            using (Font heading = new Font("Microsoft YaHei UI", 20, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush pink = new SolidBrush(Color.FromArgb(255, 141, 176))) g.DrawString("对话记录", heading, pink, x, y);
            RectangleF listClip = new RectangleF(panel.X + 22, panel.Y + 54, panel.Width - 44, panel.Height - 130);
            GraphicsState state = g.Save();
            g.SetClip(listClip);
            int count = game.Backlog.Count;
            if (count == 0)
            {
                using (Font rowFont = new Font("Microsoft YaHei UI", 14, FontStyle.Regular, GraphicsUnit.Pixel))
                using (Brush gray = new SolidBrush(Color.FromArgb(148, 155, 178))) g.DrawString("暂无记录", rowFont, gray, listClip.X + 8, listClip.Y + 10);
            }
            else
            {
                using (Font rowFont = new Font("Microsoft YaHei UI", 14, FontStyle.Regular, GraphicsUnit.Pixel))
                using (Brush white = new SolidBrush(Color.FromArgb(232, 235, 245)))
                using (Brush speakerBrush = new SolidBrush(Color.FromArgb(255, 141, 176)))
                using (StringFormat wrap = new StringFormat() { FormatFlags = StringFormatFlags.LineLimit })
                {
                    float cursor = listClip.Bottom - 8;
                    for (int i = count - 1; i >= 0; i--)
                    {
                        BacklogEntry entry = game.Backlog[i];
                        string speaker = entry == null ? "" : entry.speaker ?? "";
                        string text = entry == null ? "" : entry.text ?? "";
                        if (text.Length == 0 && speaker.Length == 0) continue;
                        float rowWidth = listClip.Width - 14;
                        SizeF measured = g.MeasureString(text, rowFont, (int)rowWidth);
                        float rowHeight = Math.Max(22, measured.Height) + (speaker.Length == 0 ? 6 : 20);
                        cursor -= rowHeight;
                        if (cursor < listClip.Y - 4) break;
                        if (speaker.Length > 0)
                        {
                            g.DrawString(speaker, rowFont, speakerBrush, listClip.X + 6, cursor + 2, wrap);
                            g.DrawString(text, rowFont, white, listClip.X + 6, cursor + 22, wrap);
                        }
                        else
                        {
                            g.DrawString(text, rowFont, white, listClip.X + 6, cursor + 2, wrap);
                        }
                    }
                }
            }
            g.Restore(state);
            using (Font rowFont = new Font("Microsoft YaHei UI", 13, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush gray = new SolidBrush(Color.FromArgb(148, 155, 178))) g.DrawString("本次运行记录 · 最新在底部", rowFont, gray, x, panel.Bottom - 64);
            float closeWidth = 160, closeHeight = 46;
            RectangleF close = new RectangleF(panel.Right - closeWidth - 24, panel.Bottom - closeHeight - 22, closeWidth, closeHeight);
            FillRoundRect(g, close, 9, Color.FromArgb(48, 53, 74));
            using (Pen pen = new Pen(Color.FromArgb(118, 130, 160), 1.3f)) DrawRoundRect(g, pen, close, 9);
            using (Font font = new Font("Microsoft YaHei UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(Color.White)) DrawCentered(g, "关闭", font, white, close);
            RegisterOverlayZone(close, OverlayAction.Close);
        }

        private static StringFormat TextFormat()
        {
            StringFormat value = new StringFormat();
            value.Trimming = StringTrimming.EllipsisWord;
            value.FormatFlags = StringFormatFlags.LineLimit;
            return value;
        }

        private static void DrawCentered(Graphics g, string text, Font font, Brush brush, RectangleF rect)
        {
            StringFormat format = new StringFormat();
            format.Alignment = StringAlignment.Center;
            format.LineAlignment = StringAlignment.Center;
            format.Trimming = StringTrimming.EllipsisWord;
            g.DrawString(text ?? "", font, brush, rect, format);
            format.Dispose();
        }

        private static Color ParseColor(string value, Color fallback)
        {
            try
            {
                if (String.IsNullOrEmpty(value)) return fallback;
                return ColorTranslator.FromHtml(value);
            }
            catch { return fallback; }
        }

        private static Color WithAlpha(Color color, double opacity)
        {
            return Color.FromArgb((int)(Math.Max(0, Math.Min(1, opacity)) * 255), color.R, color.G, color.B);
        }

        private static void DrawCover(Graphics g, Image image, Rectangle bounds)
        {
            float scale = Math.Max(bounds.Width / (float)image.Width, bounds.Height / (float)image.Height);
            float width = image.Width * scale, height = image.Height * scale;
            g.DrawImage(image, new RectangleF((bounds.Width - width) / 2, (bounds.Height - height) / 2, width, height));
        }

        private static GraphicsPath RoundPath(RectangleF rect, float radius)
        {
            float d = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private static void FillRoundRect(Graphics g, RectangleF rect, float radius, Color color)
        {
            using (GraphicsPath path = RoundPath(rect, radius)) using (Brush brush = new SolidBrush(color)) g.FillPath(brush, path);
        }

        private static void DrawRoundRect(Graphics g, Pen pen, RectangleF rect, float radius)
        {
            using (GraphicsPath path = RoundPath(rect, radius)) g.DrawPath(pen, path);
        }

        private static void DrawSoftCircle(Graphics g, PointF center, float radius, Color color)
        {
            using (GraphicsPath path = new GraphicsPath())
            {
                path.AddEllipse(center.X - radius, center.Y - radius, radius * 2, radius * 2);
                using (PathGradientBrush brush = new PathGradientBrush(path))
                {
                    brush.CenterColor = color;
                    brush.SurroundColors = new Color[] { Color.FromArgb(0, color) };
                    g.FillPath(brush, path);
                }
            }
        }
    }

    internal sealed class ImageCache : IDisposable
    {
        private readonly Dictionary<string, Image> cache = new Dictionary<string, Image>();
        private readonly HashSet<string> failed = new HashSet<string>();

        public Image Get(string source)
        {
            if (String.IsNullOrWhiteSpace(source) || source.StartsWith("data:image/svg", StringComparison.OrdinalIgnoreCase)) return null;
            Image image;
            if (cache.TryGetValue(source, out image)) return image;
            if (failed.Contains(source)) return null;
            try
            {
                byte[] bytes = ReadBytes(source);
                if (bytes == null || bytes.Length == 0) throw new InvalidDataException();
                using (MemoryStream stream = new MemoryStream(bytes)) using (Image loaded = Image.FromStream(stream)) image = new Bitmap(loaded);
                cache[source] = image;
                return image;
            }
            catch { failed.Add(source); return null; }
        }

        private const int MaxAssetBytes = 64 * 1024 * 1024;

        private static byte[] ReadBytes(string source)
        {
            if (String.IsNullOrEmpty(source)) return null;
            if (source.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                int comma = source.IndexOf(',');
                if (comma < 0) return null;
                string header = source.Substring(0, comma);
                string body = source.Substring(comma + 1);
                if (body.Length > MaxAssetBytes) return null;
                try
                {
                    return header.IndexOf(";base64", StringComparison.OrdinalIgnoreCase) >= 0 ? Convert.FromBase64String(body) : Encoding.UTF8.GetBytes(Uri.UnescapeDataString(body));
                }
                catch { return null; }
            }
            if (source.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || source.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(source);
                    request.Timeout = 6000;
                    request.ReadWriteTimeout = 6000;
                    request.UserAgent = "VisualNovelNativePlayer/1.0";
                    using (WebResponse response = request.GetResponse())
                    using (Stream stream = response.GetResponseStream())
                    using (MemoryStream memory = new MemoryStream())
                    {
                        byte[] buffer = new byte[16384];
                        int read;
                        while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            if (memory.Length + read > MaxAssetBytes) return null;
                            memory.Write(buffer, 0, read);
                        }
                        return memory.ToArray();
                    }
                }
                catch { return null; }
            }
            return null;
        }

        public void Dispose()
        {
            foreach (Image image in cache.Values) image.Dispose();
            cache.Clear();
        }
    }

    internal sealed class ConditionParser
    {
        private readonly string source;
        private readonly IDictionary<string, double> flags;
        private readonly ISet<string> readScenes;
        private readonly int projectSceneCount;
        private readonly ISet<string> unlockedEndings;
        private int position;
        private static readonly Random Randomizer = new Random();

        public ConditionParser(string expression, IDictionary<string, double> values, ISet<string> scenes, int sceneCount, ISet<string> endings)
        {
            source = expression ?? "";
            flags = values;
            readScenes = scenes;
            projectSceneCount = sceneCount;
            unlockedEndings = endings ?? new HashSet<string>();
        }

        public bool ParseBoolean()
        {
            object value = ParseOr();
            SkipSpace();
            if (position != source.Length) throw new FormatException("无法解析条件：" + source.Substring(position));
            return ToBoolean(value);
        }

        private object ParseOr()
        {
            object left = ParseAnd();
            while (Match("||")) { object right = ParseAnd(); left = ToBoolean(left) || ToBoolean(right); }
            return left;
        }

        private object ParseAnd()
        {
            object left = ParseEquality();
            while (Match("&&")) { object right = ParseEquality(); left = ToBoolean(left) && ToBoolean(right); }
            return left;
        }

        private object ParseEquality()
        {
            object left = ParseRelation();
            while (true)
            {
                if (Match("==")) left = Equal(left, ParseRelation());
                else if (Match("!=")) left = !Equal(left, ParseRelation());
                else return left;
            }
        }

        private object ParseRelation()
        {
            object left = ParseAdd();
            while (true)
            {
                if (Match(">=")) left = ToNumber(left) >= ToNumber(ParseAdd());
                else if (Match("<=")) left = ToNumber(left) <= ToNumber(ParseAdd());
                else if (Match(">")) left = ToNumber(left) > ToNumber(ParseAdd());
                else if (Match("<")) left = ToNumber(left) < ToNumber(ParseAdd());
                else return left;
            }
        }

        private object ParseAdd()
        {
            object left = ParseMultiply();
            while (true)
            {
                if (Match("+")) left = ToNumber(left) + ToNumber(ParseMultiply());
                else if (Match("-")) left = ToNumber(left) - ToNumber(ParseMultiply());
                else return left;
            }
        }

        private object ParseMultiply()
        {
            object left = ParseUnary();
            while (true)
            {
                if (Match("*")) left = ToNumber(left) * ToNumber(ParseUnary());
                else if (Match("/")) left = ToNumber(left) / ToNumber(ParseUnary());
                else if (Match("%")) left = ToNumber(left) % ToNumber(ParseUnary());
                else return left;
            }
        }

        private object ParseUnary()
        {
            if (Match("!")) return !ToBoolean(ParseUnary());
            if (Match("-")) return -ToNumber(ParseUnary());
            return ParsePrimary();
        }

        private object ParsePrimary()
        {
            SkipSpace();
            if (Match("(")) { object value = ParseOr(); if (!Match(")")) throw new FormatException("条件缺少右括号"); return value; }
            if (position < source.Length && (source[position] == '\'' || source[position] == '"')) return ParseString();
            double number;
            if (TryParseNumber(out number)) return number;
            string identifier = ParseIdentifier();
            if (String.IsNullOrEmpty(identifier)) throw new FormatException("无法解析条件");
            if (identifier == "true") return true;
            if (identifier == "false") return false;
            if (Match("("))
            {
                List<object> args = new List<object>();
                SkipSpace();
                if (!Match(")"))
                {
                    while (true)
                    {
                        args.Add(ParseOr());
                        if (Match(")")) break;
                        if (!Match(",")) throw new FormatException("函数参数错误");
                    }
                }
                return Call(identifier, args);
            }
            double flagValue;
            return flags.TryGetValue(identifier, out flagValue) ? flagValue : 0d;
        }

        private object Call(string name, IList<object> args)
        {
            if (name == "abs") return Math.Abs(ToNumber(args.Count > 0 ? args[0] : 0));
            if (name == "hourNow") return (double)DateTime.Now.Hour;
            if (name == "minuteNow") return (double)DateTime.Now.Minute;
            if (name == "sceneCount") return (double)projectSceneCount;
            if (name == "endings") return (double)unlockedEndings.Count;
            if (name == "endingSeen")
            {
                string kind = args.Count > 0 ? Convert.ToString(args[0], CultureInfo.InvariantCulture) : "";
                if (args.Count > 1)
                {
                    string title = Convert.ToString(args[1], CultureInfo.InvariantCulture);
                    return unlockedEndings.Contains(kind + "|" + title);
                }
                return unlockedEndings.Any(item => item.StartsWith(kind + "|", StringComparison.Ordinal));
            }
            if (name == "sceneRead") return args.Count > 0 && readScenes.Contains(Convert.ToString(args[0], CultureInfo.InvariantCulture));
            if (name == "chance")
            {
                double chance = Math.Max(0, Math.Min(100, ToNumber(args.Count > 0 ? args[0] : 0)));
                lock (Randomizer) return Randomizer.NextDouble() * 100 < chance;
            }
            if (name == "hourBetween")
            {
                double a = ToNumber(args.Count > 0 ? args[0] : 0), b = ToNumber(args.Count > 1 ? args[1] : 0), h = DateTime.Now.Hour;
                return a <= b ? h >= a && h <= b : h >= a || h <= b;
            }
            return false;
        }

        private string ParseString()
        {
            char quote = source[position++];
            StringBuilder builder = new StringBuilder();
            while (position < source.Length && source[position] != quote)
            {
                if (source[position] == '\\' && position + 1 < source.Length) position++;
                builder.Append(source[position++]);
            }
            if (position >= source.Length) throw new FormatException("字符串未闭合");
            position++;
            return builder.ToString();
        }

        private bool TryParseNumber(out double value)
        {
            SkipSpace();
            int start = position;
            bool dot = false;
            while (position < source.Length)
            {
                char c = source[position];
                if (Char.IsDigit(c)) position++;
                else if (c == '.' && !dot) { dot = true; position++; }
                else break;
            }
            if (position == start) { value = 0; return false; }
            return Double.TryParse(source.Substring(start, position - start), NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }

        private string ParseIdentifier()
        {
            SkipSpace();
            int start = position;
            if (position < source.Length && (Char.IsLetter(source[position]) || source[position] == '_')) position++;
            else return "";
            while (position < source.Length && (Char.IsLetterOrDigit(source[position]) || source[position] == '_')) position++;
            return source.Substring(start, position - start);
        }

        private bool Match(string token)
        {
            SkipSpace();
            if (position + token.Length <= source.Length && String.CompareOrdinal(source, position, token, 0, token.Length) == 0)
            { position += token.Length; return true; }
            return false;
        }

        private void SkipSpace() { while (position < source.Length && Char.IsWhiteSpace(source[position])) position++; }
        private static bool Equal(object a, object b)
        {
            if (a is string || b is string) return String.Equals(Convert.ToString(a, CultureInfo.InvariantCulture), Convert.ToString(b, CultureInfo.InvariantCulture), StringComparison.Ordinal);
            return Math.Abs(ToNumber(a) - ToNumber(b)) < .0000001;
        }
        private static bool ToBoolean(object value)
        {
            if (value is bool) return (bool)value;
            if (value is string) return !String.IsNullOrEmpty((string)value);
            return Math.Abs(ToNumber(value)) > .0000001;
        }
        private static double ToNumber(object value)
        {
            if (value == null) return 0;
            if (value is bool) return (bool)value ? 1 : 0;
            double number;
            return Double.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out number) ? number : 0;
        }
    }

    internal sealed class DarkToolStripRenderer : ToolStripProfessionalRenderer
    {
        public DarkToolStripRenderer() : base(new DarkColorTable()) { RoundedEdges = false; }
        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e) { }
    }

    internal sealed class DarkColorTable : ProfessionalColorTable
    {
        public override Color ToolStripGradientBegin { get { return Color.FromArgb(31, 34, 47); } }
        public override Color ToolStripGradientMiddle { get { return Color.FromArgb(31, 34, 47); } }
        public override Color ToolStripGradientEnd { get { return Color.FromArgb(31, 34, 47); } }
        public override Color ButtonSelectedHighlight { get { return Color.FromArgb(66, 70, 89); } }
        public override Color ButtonSelectedGradientBegin { get { return Color.FromArgb(66, 70, 89); } }
        public override Color ButtonSelectedGradientEnd { get { return Color.FromArgb(66, 70, 89); } }
        public override Color ButtonPressedGradientBegin { get { return Color.FromArgb(251, 114, 153); } }
        public override Color ButtonPressedGradientEnd { get { return Color.FromArgb(224, 88, 131); } }
        public override Color SeparatorDark { get { return Color.FromArgb(65, 69, 87); } }
        public override Color SeparatorLight { get { return Color.FromArgb(65, 69, 87); } }
    }
}
