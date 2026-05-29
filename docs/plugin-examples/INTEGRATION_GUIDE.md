# Plugin Integration Guide

Step-by-step instructions for integrating the item search feature into your QiqirnCompanion Dalamud plugin.

## Files Provided

- **PluginApiClient.cs** — HTTP client and type definitions for API calls
- **SearchWindow.cs** — ImGui UI for item search and sources display

## Step 1: Add Files to Your Plugin

```
QiqirnCompanion/
├── Services/
│   └── PluginApiClient.cs       ← Copy here
└── Windows/
    ├── SearchWindow.cs          ← Copy here
    └── MainWindow.cs            ← Already exists
```

## Step 2: Update Plugin.cs

In your main `Plugin.cs` file, add the search window to your window manager:

```csharp
using QiqirnCompanion.Windows;
using QiqirnCompanion.Services;
using Dalamud.Plugin;
using Dalamud.Interface.Windowing;

public class Plugin : IDalamudPlugin
{
    public string Name => "QiqirnCompanion";
    
    private WindowSystem WindowSystem = new("QiqirnCompanion");
    private PluginApiClient ApiClient { get; set; }
    
    private SearchWindow SearchWindow { get; set; }
    private MainWindow MainWindow { get; set; }
    
    public Plugin(IDalamudPluginInterface pluginInterface)
    {
        // Initialize API client with your base URL
        var baseUrl = "https://qiqirn.tools"; // Or from config
        ApiClient = new PluginApiClient(baseUrl);
        
        // Create windows
        SearchWindow = new SearchWindow(ApiClient);
        MainWindow = new MainWindow(ApiClient);
        
        // Add to window manager
        WindowSystem.AddWindow(SearchWindow);
        WindowSystem.AddWindow(MainWindow);
        
        // Hook into ImGui draw
        pluginInterface.UiBuilder.Draw += DrawUI;
    }
    
    public void Dispose()
    {
        WindowSystem.RemoveAllWindows();
    }
    
    private void DrawUI()
    {
        WindowSystem.Draw();
    }
}
```

## Step 3: Add Search to Your Main Window

In your `MainWindow.cs`, add a search button to open the search window:

```csharp
public class MainWindow : Window
{
    private SearchWindow _searchWindow;
    
    public MainWindow(PluginApiClient apiClient) : base("QiqirnCompanion")
    {
        _searchWindow = new SearchWindow(apiClient);
    }
    
    public override void Draw()
    {
        if (ImGui.Button("🔍 Item Search", new Vector2(150, 0)))
        {
            _searchWindow.IsOpen = true;
        }
        
        ImGui.SameLine();
        if (ImGui.Button("📋 Projects", new Vector2(150, 0)))
        {
            // Open projects window...
        }
        
        // Rest of your UI...
    }
}
```

Or add it as a tab in your main window:

```csharp
if (ImGui.BeginTabBar("##qiqirnTabs"))
{
    if (ImGui.BeginTabItem("Search"))
    {
        // Embed SearchWindow.Draw() here
        _searchWindow.Draw();
        ImGui.EndTabItem();
    }
    
    if (ImGui.BeginTabItem("Projects"))
    {
        // Projects tab
        ImGui.EndTabItem();
    }
    
    ImGui.EndTabBar();
}
```

## Step 4: Configure API Base URL

In your `Configuration.cs`:

```csharp
public class Configuration : IPluginConfiguration
{
    public int Version { get; set; } = 0;
    
    // Configuration properties
    public string GuildId { get; set; } = "";
    public string ApiBaseUrl { get; set; } = "https://qiqirn.tools";
    public string CharacterNameOverride { get; set; } = "";
    
    public void Save()
    {
        PluginInterface.SavePluginConfig(this);
    }
}
```

Then update Plugin.cs to use the configured URL:

```csharp
var config = pluginInterface.GetPluginConfig() as Configuration ?? new Configuration();
ApiClient = new PluginApiClient(config.ApiBaseUrl);
```

## Step 5: Handle Errors Gracefully

The SearchWindow already includes error handling, but you may want to add a global error handler:

```csharp
// In your Plugin.cs
private void DrawUI()
{
    try
    {
        WindowSystem.Draw();
    }
    catch (Exception ex)
    {
        PluginLog.Error($"UI error: {ex.Message}");
    }
}
```

## Usage in Plugin

Users will:

1. Click the Search button/tab
2. Type an item name (minimum 2 characters)
3. See paginated results in a table
4. Click an item to view all sources:
   - **Recipes** — job, level, ingredients, yield
   - **Vendors** — NPC name and price
   - **Gathering** — gather level and whether timed
   - **Special Shops** — currency and cost
   - **Company Crafts** — FC materials and requirements

## API Fallback

If the API is unreachable, the SearchWindow shows user-friendly error messages:

```csharp
Error: Unable to connect to the server. Please check your internet connection.
```

Users can close the window and try again later.

## Performance Notes

- First search takes ~200-500ms (API + snapshot load)
- Subsequent searches use Vercel edge caching (~50-100ms)
- Sources modal loads asynchronously to keep UI responsive
- All HTTP requests have reasonable timeouts (default 30s)

## Customization

### Change Colors

In `SearchWindow.cs`, the source icons use ImGui colors:

```csharp
var headerColor = new Vector4(0.2f, 0.8f, 1, 1); // Blue for recipes
var headerColor = new Vector4(1, 0.8f, 0.2f, 1); // Gold for vendors
var headerColor = new Vector4(0.2f, 1, 0.2f, 1); // Green for gathering
```

Edit these Vector4 values (R, G, B, Alpha) to match your plugin theme.

### Adjust Table Layout

In `DrawResults()`:

```csharp
ImGui.TableSetupColumn("Item Name", ImGuiTableColumnFlags.WidthStretch);
ImGui.TableSetupColumn("Rarity", ImGuiTableColumnFlags.WidthFixed, 60);
ImGui.TableSetupColumn("Recipe", ImGuiTableColumnFlags.WidthFixed, 60);
```

Add more columns or adjust widths as needed.

### Change Search Debounce

The search runs on every keystroke. To debounce (wait for user to stop typing):

```csharp
private float _searchDebounceTimer = 0;
private const float DebounceDelay = 0.5f; // 500ms

// In Draw()
if (ImGui.InputTextWithHint(...))
{
    _searchDebounceTimer = DebounceDelay;
}

// In update loop
_searchDebounceTimer -= deltaTime;
if (_searchDebounceTimer <= 0 && _searchQuery.Length >= 2)
{
    _ = PerformSearch();
    _searchDebounceTimer = float.MaxValue; // Disable until next keystroke
}
```

## Troubleshooting

### "Unable to connect to the server"

- Check internet connection
- Verify `ApiBaseUrl` is correct in config
- Check if https://qiqirn.tools is accessible

### Search returns no results

- Ensure search term is at least 2 characters
- Try a more common item name
- Check for typos (search is case-insensitive)

### Sources modal won't load

- The API might be rate-limited (wait a moment and retry)
- Check network tab in DevTools for API errors
- Verify itemId is valid

## Next Steps

After integrating search, you can add:
- **Favorites** — save frequently searched items
- **Recent searches** — quick access to previous queries
- **Quick links** — copy item names to clipboard
- **Market integration** — show current prices from Universalis
