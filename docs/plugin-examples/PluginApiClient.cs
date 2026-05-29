using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace QiqirnCompanion.Services;

/// <summary>
/// API client for QiqirnCompanion plugin.
/// Handles all HTTP communication with the qiqirn.tools backend.
/// </summary>
public class PluginApiClient
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public PluginApiClient(string baseUrl = "https://qiqirn.tools")
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _httpClient = new HttpClient();
    }

    /// <summary>
    /// Search for items by name with pagination.
    /// </summary>
    public async Task<ItemsPageResponse> SearchItems(
        string query,
        int page = 1,
        int pageSize = 20)
    {
        if (string.IsNullOrWhiteSpace(query))
            throw new ArgumentException("Query cannot be empty", nameof(query));

        var url = $"{_baseUrl}/api/plugin/items?q={Uri.EscapeDataString(query)}&page={page}&pageSize={pageSize}";
        var response = await _httpClient.GetAsync(url);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<ItemsPageResponse>(content, JsonOptions)
            ?? throw new InvalidOperationException("Failed to deserialize response");
    }

    /// <summary>
    /// Get all ways to obtain an item.
    /// </summary>
    public async Task<ItemSourcesResponse> GetItemSources(int itemId)
    {
        var url = $"{_baseUrl}/api/plugin/item-sources?id={itemId}";
        var response = await _httpClient.GetAsync(url);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        var data = JsonSerializer.Deserialize<JsonElement>(content, JsonOptions);

        return new ItemSourcesResponse
        {
            ItemId = data.GetProperty("itemId").GetInt32(),
            ItemName = data.GetProperty("itemName").GetString() ?? "",
            Sources = ParseSources(data.GetProperty("sources")),
        };
    }

    /// <summary>
    /// Get full craft breakdown with materials and costs.
    /// </summary>
    public async Task<CraftBreakdownResponse> GetCraftBreakdown(int itemId, int qty)
    {
        if (qty < 1 || qty > 99999)
            throw new ArgumentException("Quantity must be between 1 and 99999", nameof(qty));

        var url = $"{_baseUrl}/api/plugin/craft-breakdown?id={itemId}&qty={qty}";
        var response = await _httpClient.GetAsync(url);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<CraftBreakdownResponse>(content, JsonOptions)
            ?? throw new InvalidOperationException("Failed to deserialize response");
    }

    private static List<ItemSource> ParseSources(JsonElement sourcesElement)
    {
        var sources = new List<ItemSource>();

        foreach (var sourceElement in sourcesElement.EnumerateArray())
        {
            var type = sourceElement.GetProperty("type").GetString();

            var source = type switch
            {
                "recipe" => ParseRecipeSource(sourceElement),
                "vendor" => ParseVendorSource(sourceElement),
                "gather" => ParseGatheringSource(sourceElement),
                "special_shop" => ParseSpecialShopSource(sourceElement),
                "company_craft" => ParseCompanyCraftSource(sourceElement),
                _ => null,
            };

            if (source != null)
                sources.Add(source);
        }

        return sources;
    }

    private static ItemSource ParseRecipeSource(JsonElement element)
    {
        var ingredients = new List<(int ItemId, string ItemName, int Qty)>();
        foreach (var ing in element.GetProperty("ingredients").EnumerateArray())
        {
            ingredients.Add((
                ing.GetProperty("itemId").GetInt32(),
                ing.GetProperty("itemName").GetString() ?? "",
                ing.GetProperty("qty").GetInt32()
            ));
        }

        return new RecipeSource
        {
            JobId = element.GetProperty("jobId").GetInt32(),
            JobName = element.GetProperty("jobName").GetString() ?? "",
            Level = element.GetProperty("level").GetInt32(),
            Ingredients = ingredients,
            OutputQty = element.GetProperty("outputQty").GetInt32(),
        };
    }

    private static ItemSource ParseVendorSource(JsonElement element)
    {
        return new VendorSource
        {
            NpcId = element.GetProperty("npcId").GetInt32(),
            NpcName = element.GetProperty("npcName").GetString() ?? "",
            Price = element.GetProperty("price").GetInt32(),
        };
    }

    private static ItemSource ParseGatheringSource(JsonElement element)
    {
        return new GatheringSource
        {
            Level = element.GetProperty("level").GetInt32(),
            Timed = element.GetProperty("timed").GetBoolean(),
        };
    }

    private static ItemSource ParseSpecialShopSource(JsonElement element)
    {
        return new SpecialShopSource
        {
            Currency = element.GetProperty("currency").GetString() ?? "",
            CurrencyId = element.GetProperty("currencyId").GetInt32(),
            Cost = element.GetProperty("cost").GetInt32(),
        };
    }

    private static ItemSource ParseCompanyCraftSource(JsonElement element)
    {
        var ingredients = new List<(int ItemId, string ItemName, int Qty)>();
        foreach (var ing in element.GetProperty("ingredients").EnumerateArray())
        {
            ingredients.Add((
                ing.GetProperty("itemId").GetInt32(),
                ing.GetProperty("itemName").GetString() ?? "",
                ing.GetProperty("qty").GetInt32()
            ));
        }

        return new CompanyCraftSource
        {
            CraftName = element.GetProperty("craftName").GetString() ?? "",
            Ingredients = ingredients,
        };
    }
}

// Response DTOs

public class ItemsPageResponse
{
    public List<ItemSearchResult> Items { get; set; } = new();
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

public class ItemSearchResult
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool HasRecipe { get; set; }
    public int Rarity { get; set; }
}

public class ItemSourcesResponse
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = "";
    public List<ItemSource> Sources { get; set; } = new();
}

public class CraftBreakdownResponse
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = "";
    public int Quantity { get; set; }
    public List<CraftTaskDetail> Crafts { get; set; } = new();
    public List<CraftAcquisitionDetail> Acquire { get; set; } = new();
    public int? TotalCost { get; set; }
}

public class CraftTaskDetail
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = "";
    public int Qty { get; set; }
    public string Source { get; set; } = "";
}

public class CraftAcquisitionDetail
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = "";
    public int QtyNeeded { get; set; }
    public string Source { get; set; } = "";
    public Dictionary<string, object> Meta { get; set; } = new();
}

// Source base type and implementations

public abstract class ItemSource
{
    public abstract string Type { get; }
}

public class RecipeSource : ItemSource
{
    public override string Type => "recipe";
    public int JobId { get; set; }
    public string JobName { get; set; } = "";
    public int Level { get; set; }
    public List<(int ItemId, string ItemName, int Qty)> Ingredients { get; set; } = new();
    public int OutputQty { get; set; }
}

public class VendorSource : ItemSource
{
    public override string Type => "vendor";
    public int NpcId { get; set; }
    public string NpcName { get; set; } = "";
    public int Price { get; set; }
}

public class GatheringSource : ItemSource
{
    public override string Type => "gather";
    public int Level { get; set; }
    public bool Timed { get; set; }
}

public class SpecialShopSource : ItemSource
{
    public override string Type => "special_shop";
    public string Currency { get; set; } = "";
    public int CurrencyId { get; set; }
    public int Cost { get; set; }
}

public class CompanyCraftSource : ItemSource
{
    public override string Type => "company_craft";
    public string CraftName { get; set; } = "";
    public List<(int ItemId, string ItemName, int Qty)> Ingredients { get; set; } = new();
}
