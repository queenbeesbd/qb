'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronIcon, SearchIcon } from '@/components/icons';
import { normaliseForSearch } from '@/lib/format';
import type { CatalogCategory } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import {
  AVAILABILITY_FILTERS,
  type AvailabilityFilter,
  type CatalogFacets,
  type CatalogQuery,
} from '../query';
import { PriceRangeFilter } from './PriceRangeFilter';
import styles from './listing.module.css';

const INITIAL_BRANDS = 6;
const INITIAL_CATEGORIES = 8;

type Props = {
  value: CatalogQuery;
  facets: CatalogFacets;
  categories: readonly CatalogCategory[];
  /** Products in the catalog, for the "all categories" row. */
  allCount: number;
  /** Desktop applies immediately; the drawer sends this to its draft instead. */
  onFilterChange: (patch: Partial<CatalogQuery>) => void;
  categoryHref: (slug: string) => string;
  /** Closes the drawer after a category link navigates. */
  onCategoryNavigate?: () => void;
  idPrefix: string;
};

/**
 * The filter rail, shared by the desktop sidebar and the mobile drawer.
 *
 * It is a controlled surface: it never decides whether a change is written to the URL or held in a
 * draft. The desktop passes the live query and a push function; the drawer passes its draft. That is
 * what keeps the two experiences one filter system instead of two implementations that can disagree.
 */
export function FilterControls({
  value,
  facets,
  categories,
  allCount,
  onFilterChange,
  categoryHref,
  onCategoryNavigate,
  idPrefix,
}: Props) {
  const { t, pick, price } = useTranslation();
  const [categoryOpen, setCategoryOpen] = useState(true);
  /*
   * Brand is the long section: six rows plus a search field before Show more. It starts collapsed so
   * the rail is a readable table of contents on a laptop screen, and opens by itself when a brand is
   * already applied so the active controls are never hidden.
   */
  const [brandOpen, setBrandOpen] = useState(() => value.brands.length > 0);
  /*
   * Price and availability are secondary refinements, so they start collapsed. Their active state is
   * still stated in the section header, which is what makes disclosure different from hiding: the
   * shopper can see that a range or a stock state is applied without opening the section.
   */
  const [priceOpen, setPriceOpen] = useState(
    () => value.minPrice !== null || value.maxPrice !== null,
  );
  const [availabilityOpen, setAvailabilityOpen] = useState(
    () => value.availability.length > 0,
  );
  const [brandTerm, setBrandTerm] = useState('');
  const [brandsExpanded, setBrandsExpanded] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);

  /*
   * The rail lists **departments**, not every category: a subcategory is reached through its parent,
   * so it is not offered here as a peer. The active category is always kept, so opening a child's
   * page still shows which department is selected.
   */
  const presentIds = new Set(categories.map((category) => category.id));
  const filterCategories = categories.filter(
    (category) =>
      category.parentId === null || !presentIds.has(category.parentId) || category.slug === value.category,
  );

  const categoryCounts = new Map(facets.categories.map((entry) => [entry.slug, entry.count]));
  const activeCategoryIndex = filterCategories.findIndex((category) => category.slug === value.category);
  const visibleCategories = categoriesExpanded
    ? filterCategories
    : filterCategories.filter(
        (_category, index) => index < INITIAL_CATEGORIES || index === activeCategoryIndex,
      );
  const hiddenCategoryCount = filterCategories.length - visibleCategories.length;
  const hasPriceBounds = facets.price.max > 0 && facets.price.max > facets.price.min;
  const activeCategory = categories.find((entry) => entry.slug === value.category) ?? null;

  /* Each header states what is applied when the section is closed. */
  const categorySummary = activeCategory ? (pick(activeCategory.name) ?? null) : null;
  const brandSummary =
    value.brands.length > 0
      ? t('catalog.selectedCount', { count: value.brands.length })
      : null;
  const priceSummary =
    value.minPrice !== null && value.maxPrice !== null
      ? t('catalog.priceBetween', { min: price(value.minPrice), max: price(value.maxPrice) })
      : value.minPrice !== null
        ? t('catalog.priceFrom', { min: price(value.minPrice) })
        : value.maxPrice !== null
          ? t('catalog.priceUpTo', { max: price(value.maxPrice) })
          : null;
  const availabilitySummary =
    value.availability.length === 0
      ? null
      : value.availability.length === 1
        ? value.availability[0] === 'in_stock'
          ? t('catalog.inStock')
          : t('catalog.outOfStock')
        : t('catalog.selectedCount', { count: value.availability.length });

  const needle = normaliseForSearch(brandTerm);
  const selectedBrands = value.brands.map((name) => ({
    name,
    count: facets.brands.find((brand) => brand.name === name)?.count ?? 0,
  }));
  const matchingBrands = facets.brands.filter(
    (brand) => !needle || normaliseForSearch(brand.name).includes(needle),
  );
  const unselectedMatches = matchingBrands.filter((brand) => !value.brands.includes(brand.name));
  const visibleBrands =
    brandsExpanded || needle ? unselectedMatches : unselectedMatches.slice(0, INITIAL_BRANDS);
  const hiddenBrandCount = unselectedMatches.length - INITIAL_BRANDS;

  function toggleBrand(name: string) {
    const next = value.brands.includes(name)
      ? value.brands.filter((brand) => brand !== name)
      : [...value.brands, name];
    onFilterChange({ brands: next });
  }

  function toggleAvailability(entry: AvailabilityFilter) {
    const next = value.availability.includes(entry)
      ? value.availability.filter((item) => item !== entry)
      : [...value.availability, entry];
    onFilterChange({ availability: next });
  }

  return (
    <div className={styles.filterControls}>
      <FilterSection
        id={`${idPrefix}-category`}
        title={t('catalog.filterCategory')}
        summary={categorySummary}
        open={categoryOpen}
        onToggle={() => setCategoryOpen((open) => !open)}
      >
        <ul className={styles.categoryList}>
          <li>
            <Link
              href={categoryHref('')}
              className={styles.categoryLink}
              aria-current={value.category ? undefined : 'page'}
              onClick={onCategoryNavigate}
            >
              <span>{t('catalog.allCategories')}</span>
              <span className={styles.facetCount}>{allCount.toLocaleString('en-US')}</span>
            </Link>
          </li>
          {visibleCategories.map((category) => {
            const count = categoryCounts.get(category.slug) ?? 0;
            const name = pick(category.name);
            return (
              <li key={category.id}>
                <Link
                  href={categoryHref(category.slug)}
                  className={styles.categoryLink}
                  aria-current={value.category === category.slug ? 'page' : undefined}
                  onClick={onCategoryNavigate}
                  title={name ?? undefined}
                >
                  <span className={styles.categoryName}>{name}</span>
                  <span className={styles.facetCount}>{count.toLocaleString('en-US')}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {hiddenCategoryCount > 0 && (
          <button
            type="button"
            className={styles.moreButton}
            aria-expanded={categoriesExpanded}
            onClick={() => setCategoriesExpanded((expanded) => !expanded)}
          >
            <span>
              {categoriesExpanded
                ? t('catalog.showFewerCategories')
                : t('catalog.showMoreCategories', { count: hiddenCategoryCount })}
            </span>
            <ChevronIcon
              width={13}
              height={13}
              aria-hidden="true"
              className={styles.moreChevron}
              data-open={categoriesExpanded ? 'true' : 'false'}
            />
          </button>
        )}
      </FilterSection>

      <FilterSection
        id={`${idPrefix}-brand`}
        title={t('catalog.filterBrand')}
        summary={brandSummary}
        open={brandOpen}
        onToggle={() => setBrandOpen((open) => !open)}
      >
        {facets.brands.length > INITIAL_BRANDS && (
          <div className={styles.field}>
            <SearchIcon width={15} height={15} aria-hidden="true" className={styles.fieldIcon} />
            <input
              type="search"
              value={brandTerm}
              onChange={(event) => setBrandTerm(event.target.value)}
              placeholder={t('catalog.searchBrands')}
              aria-label={t('catalog.searchBrands')}
              autoComplete="off"
              maxLength={60}
            />
          </div>
        )}

        {facets.brands.length === 0 && (
          <p className={styles.facetEmpty}>{t('catalog.noBrands')}</p>
        )}

        {selectedBrands.length > 0 && (
          <div className={styles.selectedGroup} role="group" aria-label={t('catalog.selectedBrands')}>
            <div className={styles.selectedHead}>
              <p className={styles.microLabel}>{t('catalog.selectedBrands')}</p>
              <button
                type="button"
                className={styles.inlineClear}
                onClick={() => onFilterChange({ brands: [] })}
              >
                {t('catalog.resetSection')}
              </button>
            </div>
            <ul className={styles.optionList}>
              {selectedBrands.map((brand) => (
                <li key={brand.name}>
                  <BrandOption
                    name={brand.name}
                    count={brand.count}
                    checked
                    onToggle={() => toggleBrand(brand.name)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {visibleBrands.length > 0 && (
          <div className={styles.optionGroup}>
            {selectedBrands.length > 0 && (
              <p className={styles.microLabel}>{t('catalog.allBrands')}</p>
            )}
            <ul className={styles.optionList}>
              {visibleBrands.map((brand) => (
                <li key={brand.name}>
                  <BrandOption
                    name={brand.name}
                    count={brand.count}
                    checked={false}
                    onToggle={() => toggleBrand(brand.name)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {needle && matchingBrands.length === 0 && (
          <p className={styles.facetEmpty}>{t('catalog.noBrandMatch', { query: brandTerm })}</p>
        )}

        {!needle && hiddenBrandCount > 0 && (
          <button
            type="button"
            className={styles.moreButton}
            aria-expanded={brandsExpanded}
            onClick={() => setBrandsExpanded((expanded) => !expanded)}
          >
            <span>
              {brandsExpanded
                ? t('catalog.showFewerBrands')
                : t('catalog.showMoreBrands', { count: hiddenBrandCount })}
            </span>
            <ChevronIcon
              width={13}
              height={13}
              aria-hidden="true"
              className={styles.moreChevron}
              data-open={brandsExpanded ? 'true' : 'false'}
            />
          </button>
        )}
      </FilterSection>

      {hasPriceBounds && (
        <FilterSection
          id={`${idPrefix}-price`}
          title={t('catalog.filterPrice')}
          summary={priceSummary}
          open={priceOpen}
          onToggle={() => setPriceOpen((open) => !open)}
        >
          <PriceRangeFilter
            key={`${value.minPrice ?? 'any'}-${value.maxPrice ?? 'any'}`}
            bounds={facets.price}
            minPrice={value.minPrice}
            maxPrice={value.maxPrice}
            onCommit={(minPrice, maxPrice) => onFilterChange({ minPrice, maxPrice })}
            idPrefix={`${idPrefix}-price`}
          />
        </FilterSection>
      )}

      <FilterSection
        id={`${idPrefix}-availability`}
        title={t('catalog.filterAvailability')}
        summary={availabilitySummary}
        open={availabilityOpen}
        onToggle={() => setAvailabilityOpen((open) => !open)}
      >
        <ul className={styles.optionList}>
          {AVAILABILITY_FILTERS.map((entry) => (
            <li key={entry}>
              <label className={styles.option} data-selected={value.availability.includes(entry) ? 'true' : undefined}>
                <input
                  type="checkbox"
                  className={styles.checkInput}
                  checked={value.availability.includes(entry)}
                  onChange={() => toggleAvailability(entry)}
                />
                <span className={styles.checkBox} aria-hidden="true" />
                <span className={styles.optionLabel}>
                  {entry === 'in_stock' ? t('catalog.inStock') : t('catalog.outOfStock')}
                </span>
                <span className={styles.facetCount}>
                  {facets.availability[entry].toLocaleString('en-US')}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </FilterSection>
    </div>
  );
}

function FilterSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary?: string | null;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const bodyId = `${id}-body`;
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <button
          type="button"
          id={`${id}-title`}
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          /* The visible title and summary are separate spans; this keeps the accessible name spaced. */
          aria-label={summary ? `${title}, ${summary}` : title}
          onClick={onToggle}
        >
          <span className={styles.sectionTitle}>{title}</span>
          {summary ? <span className={styles.sectionSummary}>{summary}</span> : null}
          <ChevronIcon
            width={14}
            height={14}
            aria-hidden="true"
            className={styles.chevron}
            data-open={open ? 'true' : 'false'}
          />
        </button>
      </div>
      {open && (
        <div id={bodyId} className={styles.sectionBody} aria-labelledby={`${id}-title`}>
          {children}
        </div>
      )}
    </section>
  );
}

function BrandOption({
  name,
  count,
  checked,
  onToggle,
}: {
  name: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className={styles.option} data-selected={checked ? 'true' : undefined}>
      <input
        type="checkbox"
        className={styles.checkInput}
        checked={checked}
        onChange={onToggle}
        data-brand={name}
      />
      <span className={styles.checkBox} aria-hidden="true" />
      <span className={styles.optionLabel} title={name}>
        {name}
      </span>
      <span className={styles.facetCount}>{count.toLocaleString('en-US')}</span>
    </label>
  );
}
