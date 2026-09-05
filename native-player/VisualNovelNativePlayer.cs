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
        public string id { get; set; }
        public string title { get; set; }
        public string startScene { get; set; }
        public Dictionary<string, object> flags { get; set; }
        public List<SceneData> scenes { get; set; }
        public List<LibraryCharacterData> characters { get; set; }
        public UiData ui { get; set; }
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
        private FormBorderStyle previousBorder;
        private FormWindowState previousState;

        public GameForm(ProjectData value)
        {
            project = value;
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
        }

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
            strip.Items.Add(new ToolStripSeparator());
            AddButton(strip, "快速保存", delegate { SaveProgress(); });
            AddButton(strip, "快速读取", delegate { LoadProgress(); });
            strip.Items.Add(new ToolStripSeparator());
            AddButton(strip, "全屏", delegate { ToggleFullscreen(); });
            ToolStripLabel hint = new ToolStripLabel("  Space / Enter 继续 · 数字键选择");
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
            flags.Clear();
            if (project.flags != null)
                foreach (KeyValuePair<string, object> pair in project.flags) flags[pair.Key] = ConvertNumber(pair.Value);
            history.Clear();
            readScenes.Clear();
            endingTitle = "";
            scene = null;
            EnterScene(project.startScene, null, false);
        }

        public void ShowTitle()
        {
            mode = PlayerMode.Title;
            VisibleChoices = new List<ChoiceData>();
            canvas.Invalidate();
        }

        private void EnterScene(string id, IList<FlagOperationData> choiceOperations, bool remember)
        {
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
            ApplyOperations(scene.setFlags);
            dialogueIndex = 0;
            mode = PlayerMode.Playing;
            VisibleChoices = new List<ChoiceData>();
            canvas.SceneChanged();
            if (CurrentDialogues().Count == 0) ShowOutcome();
            canvas.Invalidate();
        }

        public void Advance()
        {
            if (mode == PlayerMode.Title || mode == PlayerMode.Ending) { StartGame(); return; }
            if (mode == PlayerMode.Choices) return;
            List<DialogueData> list = CurrentDialogues();
            if (dialogueIndex < list.Count - 1)
            {
                history.Add(CaptureSnapshot());
                dialogueIndex++;
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
            if (mode != PlayerMode.Choices || VisibleChoices == null || index < 0 || index >= VisibleChoices.Count) return;
            ChoiceData choice = VisibleChoices[index];
            history.Add(CaptureSnapshot());
            EnterScene(choice.target, choice.setFlags, false);
        }

        public void GoBack()
        {
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
            canvas.SceneChanged();
            canvas.Invalidate();
        }

        private string SavePath()
        {
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VisualNovelStudio", "Saves");
            Directory.CreateDirectory(folder);
            string safe = Regex.Replace(project.id ?? project.title ?? "game", "[^A-Za-z0-9_-]", "_");
            return Path.Combine(folder, safe + ".json");
        }

        private void SaveProgress()
        {
            if (scene == null || mode == PlayerMode.Title) return;
            File.WriteAllText(SavePath(), Json.Create().Serialize(CaptureSnapshot()), new UTF8Encoding(false));
            canvas.ShowNotice("进度已保存");
        }

        private void LoadProgress()
        {
            string path = SavePath();
            if (!File.Exists(path)) { canvas.ShowNotice("还没有保存记录"); return; }
            RestoreSnapshot(Json.Create().Deserialize<PlayerSnapshot>(File.ReadAllText(path, Encoding.UTF8)));
            canvas.ShowNotice("进度已读取");
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
            if (mode == PlayerMode.Choices && e.KeyCode >= Keys.D1 && e.KeyCode <= Keys.D9)
            {
                SelectChoice((int)e.KeyCode - (int)Keys.D1); e.Handled = true; return;
            }
            if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter) { Advance(); e.Handled = true; }
            else if (e.KeyCode == Keys.Back) { GoBack(); e.Handled = true; }
            else if (e.KeyCode == Keys.F11) { ToggleFullscreen(); e.Handled = true; }
            else if (e.KeyCode == Keys.Escape && fullscreen) { ToggleFullscreen(); e.Handled = true; }
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
                else DrawDialogueAndChoices(g, bounds);
            }
            if (!String.IsNullOrEmpty(notice) && DateTime.Now < noticeUntil) DrawNotice(g, bounds);
        }

        private void DrawTitle(Graphics g, Rectangle bounds)
        {
            using (LinearGradientBrush background = new LinearGradientBrush(bounds, Color.FromArgb(31, 25, 45), Color.FromArgb(15, 20, 31), 35f)) g.FillRectangle(background, bounds);
            DrawSoftCircle(g, new PointF(bounds.Width * .18f, bounds.Height * .24f), Math.Min(bounds.Width, bounds.Height) * .23f, Color.FromArgb(42, 251, 114, 153));
            DrawSoftCircle(g, new PointF(bounds.Width * .82f, bounds.Height * .72f), Math.Min(bounds.Width, bounds.Height) * .28f, Color.FromArgb(34, 0, 161, 214));
            RectangleF titleRect = new RectangleF(bounds.Width * .1f, bounds.Height * .3f, bounds.Width * .8f, 100);
            using (Font titleFont = new Font("Microsoft YaHei UI", Math.Max(28, bounds.Width / 32f), FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(Color.White))
                DrawCentered(g, game.Project.title, titleFont, white, titleRect);
            RectangleF subRect = new RectangleF(bounds.Width * .2f, bounds.Height * .47f, bounds.Width * .6f, 42);
            using (Font subFont = new Font("Microsoft YaHei UI", 15, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush muted = new SolidBrush(Color.FromArgb(188, 195, 217)))
                DrawCentered(g, "原生 Windows 视觉小说", subFont, muted, subRect);
            RectangleF button = new RectangleF(bounds.Width / 2f - 100, bounds.Height * .61f, 200, 54);
            FillRoundRect(g, button, 12, Color.FromArgb(251, 114, 153));
            using (Font buttonFont = new Font("Microsoft YaHei UI", 17, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush white = new SolidBrush(Color.White)) DrawCentered(g, "开始游戏", buttonFont, white, button);
            RectangleF hint = new RectangleF(bounds.Width * .2f, bounds.Height * .75f, bounds.Width * .6f, 30);
            using (Font hintFont = new Font("Microsoft YaHei UI", 12, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush muted = new SolidBrush(Color.FromArgb(135, 145, 168))) DrawCentered(g, "单击画面或按 Space / Enter", hintFont, muted, hint);
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
                    g.DrawString(game.DisplayText(dialogue.text), textFont, textBrush, textRect, TextFormat());
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
            Focus();
            if (game.Mode == PlayerMode.Choices)
            {
                for (int i = 0; i < choiceRects.Count; i++) if (choiceRects[i].Contains(e.Location)) { game.SelectChoice(i); return; }
                return;
            }
            game.Advance();
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
