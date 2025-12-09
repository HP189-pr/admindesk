"""
PostgreSQL Full-Text Search Utilities
GIN + tsvector for 100× faster search on large datasets
"""
from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db.models import Q, F
from functools import wraps


def apply_fts_search(queryset, search_query, search_fields, fallback_fields=None):
    """
    Apply Full-Text Search (FTS) with GIN index if search_vector exists,
    otherwise fall back to traditional icontains search.
    
    For enrollment numbers and IDs, use exact or prefix matching.
    For names and text, use full-text search.
    
    Args:
        queryset: Django QuerySet
        search_query: Search string from user
        search_fields: List of field names for SearchVector (for FTS)
        fallback_fields: List of field names for fallback search (optional)
    
    Returns:
        Filtered queryset with search applied
    """
    if not search_query or not search_query.strip():
        return queryset
    
    # Check if model has search_vector field (FTS enabled)
    model = queryset.model
    has_fts = hasattr(model, 'search_vector') and 'search_vector' in [f.name for f in model._meta.get_fields()]
    
    if has_fts:
        # Use PostgreSQL Full-Text Search with prefix matching for IDs/numbers
        try:
            # Normalize search query: lowercase and handle special characters
            # Split into tokens and add prefix matching for each token
            tokens = search_query.lower().strip().split()
            
            # Build FTS query: each token with prefix matching, joined by OR
            # This makes it case-insensitive and matches any token
            fts_parts = ' | '.join([f"{token}:*" for token in tokens if token])
            
            if not fts_parts:
                return queryset
            
            query = SearchQuery(fts_parts, search_type='raw', config='simple')
            
            queryset = queryset.annotate(
                rank=SearchRank(F('search_vector'), query)
            ).filter(
                search_vector=query
            ).order_by('-rank')  # Most relevant first
            return queryset
        except Exception as e:
            # Fallback to traditional search if FTS fails
            print(f"FTS search failed, using fallback: {e}")
    
    # Fallback: Traditional icontains search
    if fallback_fields:
        q_objects = Q()
        for field in fallback_fields:
            q_objects |= Q(**{f"{field}__icontains": search_query})
        return queryset.filter(q_objects)
    else:
        # Build Q objects from field names
        q_objects = Q()
        for field in search_fields:
            if field != 'search_vector':
                q_objects |= Q(**{f"{field}__icontains": search_query})
        return queryset.filter(q_objects)


def fts_queryset_mixin(search_param='search'):
    """
    Decorator to automatically apply FTS search to ViewSet's get_queryset()
    
    Usage:
        @fts_queryset_mixin(search_param='search')
        def get_queryset(self):
            return MyModel.objects.all()
    """
    def decorator(get_queryset_func):
        @wraps(get_queryset_func)
        def wrapper(self, *args, **kwargs):
            queryset = get_queryset_func(self, *args, **kwargs)
            
            # Get search query from request
            search_query = self.request.query_params.get(search_param, '').strip()
            
            if not search_query:
                return queryset
            
            # Check if ViewSet has FTS configuration
            if hasattr(self, 'fts_search_fields'):
                search_fields = self.fts_search_fields
                fallback_fields = getattr(self, 'fts_fallback_fields', None)
                return apply_fts_search(queryset, search_query, search_fields, fallback_fields)
            
            return queryset
        
        return wrapper
    return decorator


def update_search_vector(instance, fields):
    """
    Update search_vector field for a model instance
    
    Args:
        instance: Model instance
        fields: List of field names to include in search vector
    """
    if not hasattr(instance, 'search_vector'):
        return
    
    from django.contrib.postgres.search import SearchVector
    
    # Build search vector from specified fields
    vectors = []
    for field in fields:
        if hasattr(instance, field):
            value = getattr(instance, field)
            if value:
                vectors.append(SearchVector(field))
    
    if vectors:
        instance.search_vector = SearchVector(*vectors)
