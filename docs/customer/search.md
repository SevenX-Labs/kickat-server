# Customer Search & Discovery API Specification

All search endpoints are served under `/api/v1/search`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/search` | No | Full-text product search with dynamic filter facets |
| `GET` | `/api/v1/search/suggestions` | No | Autocomplete keyword suggestions |
| `GET` | `/api/v1/search/recent` | Yes | List logged-in user's recent search queries |
| `DELETE` | `/api/v1/search/recent/:queryId` | Yes | Delete specific recent search query |
| `GET` | `/api/v1/search/trending` | No | Trending search terms |
| `GET` | `/api/v1/search/popular` | No | Popular search keywords |
| `GET` | `/api/v1/search/filters` | No | Get available search filter facets (brands, price range, species, diets) |
