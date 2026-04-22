---
inclusion: auto
---

# Coding Best Practices

## Element Tag Name Comparison

When comparing element tag names, use `element.localName` instead of `element.tagName.toLowerCase()`.

**Why:**
- `localName` is already lowercase (returns the local part of the qualified name)
- More efficient (no string conversion needed)
- Cleaner and more readable code
- Standard practice in modern web development

**Example:**

```typescript
// ❌ Avoid
const tagName = element.tagName.toLowerCase();
if (tagName === 'input') { /* ... */ }

// ✅ Prefer
const tagName = element.localName;
if (tagName === 'input') { /* ... */ }
```

**Note:** For XML/XHTML documents with namespaced elements, `localName` returns just the local part (e.g., 'div' from 'html:div'), while `tagName` returns the full qualified name. For HTML documents, they're functionally equivalent except for the casing.

## When to Use Each Property

- **`localName`**: Use for tag name comparisons in HTML documents (recommended)
- **`tagName`**: Use when you need the original casing (rare) or working with XML namespaces
- **`nodeName`**: Use when working with any node type (not just elements)

## Implementation Examples

The Infer enhancement demonstrates this pattern:

```typescript
export function inferValueProperty(element: Element): string {
    const tagName = element.localName;
    
    if (tagName === 'input') {
        const type = element.getAttribute('type')?.toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
            return 'checked';
        }
        return 'value';
    }
    
    if (tagName === 'textarea' || tagName === 'select') {
        return 'value';
    }
    
    // ... more comparisons
}
```
