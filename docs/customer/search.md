# Customer Search API Specification

All search, filtering, and autocomplete endpoints are served under `/api/v1/search`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/search` | Optional | Main search endpoint with full faceting |
| `GET` | `/api/v1/search/suggestions` | No | Autocomplete typeahead suggestions |
| `GET` | `/api/v1/search/recent` | Yes | Get logged-in user's recent searches |
| `DELETE`| `/api/v1/search/recent/:queryId` | Yes | Delete a specific recent search |
| `GET` | `/api/v1/search/trending` | No | Get global trending searches |
| `GET` | `/api/v1/search/popular` | No | Get historically popular searches |
| `GET` | `/api/v1/search/filters` | No | Get dynamic filtering facets |

---

## Endpoint Details

### 1. Catalog Search

#### Main Search Endpoint
- **GET** `/api/v1/search`
- **Query Params:**
  - `q`: Search keyword (e.g., "dog food")
  - `page`, `limit`
  - `categoryId`, `brand`, `priceMin`, `priceMax`, `petSpecies`, `diet`
  - `sort`: `relevance`, `price_asc`, `price_desc`, `rating`
- **Description:** Returns paginated product results. Passing a Bearer token saves the search query to the user's recent history.

#### Autocomplete Suggestions
- **GET** `/api/v1/search/suggestions`
- **Query Params:** `q` (The partial keyword)
- **Response:** Extremely fast response returning potential full keywords and top 3 matching products.

### 2. Search Context & History

#### User Recent Searches
- **GET** `/api/v1/search/recent`
- **Response:** Returns an array of search strings the authenticated user recently queried.

#### Delete Recent Search
- **DELETE** `/api/v1/search/recent/:queryId`
- **Description:** Removes a query from the user's recent history dropdown.

#### Trending & Popular Searches
- **GET** `/api/v1/search/trending`
- **GET** `/api/v1/search/popular`
- **Description:** Used to populate the empty state of the search bar dropdown.

### 3. Dynamic Filtering
- **GET** `/api/v1/search/filters`
- **Query Params:** `categoryId` (Optional)
- **Response:** Returns distinct available brands, species, diets, and price ranges (min/max) dynamically based on the current product catalog or category context.
