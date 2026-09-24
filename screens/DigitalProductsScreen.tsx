import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ContentBadges from '../components/ContentBadges';
import PremiumUnlock from '../components/PremiumUnlock';
import SegmentedHeader from '../components/SegmentedHeader';
import { onPremiumChanged } from '../lib/billing';
import { fetchDigitalProductContent, fetchDigitalProducts } from '../lib/digitalProducts';
import { CATEGORY_FILTER_SEGMENTS, CATEGORY_LABELS, CONTENT_CATEGORIES, type CategoryFilter } from '../lib/library';
import { dark } from '../lib/theme';
import type { DigitalProductContent, DigitalProductWithStatus } from '../lib/types';

export default function DigitalProductsScreen() {
  const [products, setProducts] = useState<DigitalProductWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, DigitalProductContent | null>>({});
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      setProducts(await fetchDigitalProducts());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // A Premium purchase (or restore) unlocks guides without leaving the screen.
  useEffect(() => onPremiumChanged(() => void load()), [load]);

  const sections = useMemo(() => {
    return CONTENT_CATEGORIES.filter((c) => category === 'all' || c.value === category)
      .map((c) => ({
        category: c.value,
        items: products.filter((p) => p.content_category === c.value),
      }))
      .filter((s) => s.items.length > 0);
  }, [products, category]);

  const toggleExpand = async (product: DigitalProductWithStatus) => {
    if (expandedId === product.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(product.id);
    if (product.unlocked && content[product.id] === undefined) {
      setContentLoading(true);
      try {
        const c = await fetchDigitalProductContent(product.id);
        setContent((prev) => ({ ...prev, [product.id]: c }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setContentLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SegmentedHeader segments={CATEGORY_FILTER_SEGMENTS} active={category} onChange={setCategory} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Guides & Plans</Text>
        <Text style={styles.subtitle}>
          Free starter guides to get going, and the full library of programmes and plans with Premium.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}

        {sections.length === 0 && (
          <Text style={styles.empty}>
            {category === 'all'
              ? 'Nothing available yet — check back soon.'
              : 'Nothing in this category yet — new content is added regularly.'}
          </Text>
        )}

        {sections.map((section) => (
          <View key={section.category} style={styles.section}>
            <Text style={styles.sectionTitle}>{CATEGORY_LABELS[section.category]}</Text>

            {section.items.map((item) => {
              const expanded = expandedId === item.id;
              const productContent = content[item.id];

              return (
                <View key={item.id} style={styles.card}>
                  <Pressable onPress={() => toggleExpand(item)}>
                    <ContentBadges isFree={item.is_free} publishedAt={item.published_at} unlocked={item.unlocked} />
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                    </View>
                    {item.description ? <Text style={styles.cardDescription}>{item.description}</Text> : null}
                  </Pressable>

                  {!item.unlocked ? (
                    <PremiumUnlock message="Included with Premium." />
                  ) : expanded ? (
                    contentLoading && productContent === undefined ? (
                      <ActivityIndicator style={{ marginTop: 12 }} color={dark.accent} />
                    ) : (
                      <View style={styles.contentBox}>
                        {productContent?.body ? <Text style={styles.contentText}>{productContent.body}</Text> : null}
                        {productContent?.file_url ? (
                          <Pressable onPress={() => Linking.openURL(productContent.file_url)}>
                            <Text style={styles.fileLink}>⬇ Download</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )
                  ) : (
                    <Pressable onPress={() => toggleExpand(item)}>
                      <Text style={styles.ownedHint}>Tap to read →</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: dark.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: dark.text,
  },
  subtitle: {
    fontSize: 13,
    color: dark.textFaint,
    marginTop: 4,
    marginBottom: 16,
  },
  error: {
    color: dark.danger,
    marginBottom: 12,
  },
  empty: {
    color: dark.textFaint,
    textAlign: 'center',
    marginTop: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
    marginBottom: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    color: dark.text,
  },
  cardDescription: {
    fontSize: 13,
    color: dark.textMuted,
    marginTop: 6,
  },
  ownedHint: {
    color: dark.accent,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 10,
  },
  contentBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    paddingTop: 12,
  },
  contentText: {
    fontSize: 14,
    color: dark.text,
    lineHeight: 20,
  },
  fileLink: {
    color: dark.accent,
    fontWeight: '600',
    marginTop: 10,
  },
});
