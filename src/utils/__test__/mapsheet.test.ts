import assert from 'node:assert';
import { describe, it } from 'node:test';

import type { MapTileIndex } from '../mapsheet.ts';
import { MapSheet, SheetRanges } from '../mapsheet.ts';
import { MapSheetData } from './mapsheet.data.ts';

describe('MapSheets', () => {
  it('should extract MapTileIndex from 1:500 tile filename', () => {
    assert.deepEqual(MapSheet.getMapTileIndex('2022_CG10_500_080037.tiff'), {
      mapSheet: 'CG10',
      gridSize: 500,
      x: 37,
      y: 80,
      name: 'CG10_500_080037',
      origin: { x: 1236640, y: 4837560 },
      width: 240,
      height: 360,
      bbox: [1236640, 4837200, 1236880, 4837560],
    });
  });
  it('should extract MapTileIndex from 1:50k tile filename', () => {
    assert.deepEqual(MapSheet.getMapTileIndex('AS21.tiff'), {
      mapSheet: 'AS21',
      gridSize: 50_000,
      x: 1_492_000, // MapSheet.offset('AS21').x
      y: 6_234_000, // MapSheet.offset('AS21').y
      name: 'AS21',
      origin: { x: 1_492_000, y: 6_234_000 }, // MapSheet.offset('AS21')
      width: 24_000, // MapSheet.width
      height: 36_000, // MapSheet.height
      bbox: [
        1_492_000, // MapSheet.offset('AS21').x
        6_198_000, // MapSheet.offset('AS21').y - MapSheet.height
        1_516_000, // MapSheet.offset('AS21').x + MapSheet.width
        6_234_000, // MapSheet.offset('AS21').y
      ],
    });
  });

  it('should calculate offsets', () => {
    assert.deepEqual(MapSheet.offset('AS00'), { x: 988000, y: 6234000 });
    assert.deepEqual(MapSheet.offset('AS21'), { x: 1492000, y: 6234000 });
    assert.deepEqual(MapSheet.offset('BG33'), { x: 1780000, y: 5730000 });
    assert.deepEqual(MapSheet.offset('BW14'), { x: 1324000, y: 5226000 });
  });

  it('should calculate for all sheets', () => {
    for (const ms of MapSheetData) {
      assert.deepEqual(MapSheet.offset(ms.code), ms.origin);
      assert.equal(MapSheet.isKnown(ms.code), true);
    }
  });

  it('should round trip all sheets', () => {
    for (const ms of MapSheetData) {
      assert.equal(MapSheet.sheetCode(ms.origin.x, ms.origin.y), ms.code);
    }
  });

  it('should not know invalid mapsheets', () => {
    assert.equal(MapSheet.isKnown('BC39'), false);
    assert.equal(MapSheet.isKnown('AAAA'), false);
    assert.equal(MapSheet.isKnown('A'), false);
    assert.equal(MapSheet.isKnown('BC99'), false);
    assert.equal(MapSheet.isKnown('bw14'), false);
    assert.equal(MapSheet.isKnown('AA14'), false);
  });

  it('should validate map sheet range', () => {
    const validSheet = new Set();
    for (const [key, ranges] of Object.entries(SheetRanges)) {
      for (const [low, high] of ranges) {
        for (let i = low; i <= high; i++) {
          const code = String(i).padStart(2, '0');
          validSheet.add(`${key}${code}`);
        }
      }
    }

    for (const sheet of MapSheetData) {
      assert.equal(validSheet.has(sheet.code), true, 'Sheetcode missing: ' + sheet.code);
      validSheet.delete(sheet.code);
    }
    assert.equal(validSheet.size, 0);
  });

  const TestBounds = [
    { name: 'CG10_500_079035', bbox: [1236160, 4837560, 1236400, 4837920] },
    { name: 'CG10_500_079036', bbox: [1236400, 4837560, 1236640, 4837920] },
  ] as const;

  for (const test of TestBounds) {
    it('should get expected size with file ' + test.name, () => {
      const mapTileIndex = MapSheet.getMapTileIndex(test.name) as MapTileIndex;
      assert.equal(mapTileIndex.origin.x, test.bbox[0]);
      assert.equal(mapTileIndex.origin.y, test.bbox[3]);
      assert.equal(mapTileIndex.width, test.bbox[2] - test.bbox[0]);
      assert.equal(mapTileIndex.height, test.bbox[3] - test.bbox[1]);
    });

    it('should get expected bounds with file ' + test.name, () => {
      const mapTileIndex = MapSheet.getMapTileIndex(test.name) as MapTileIndex;
      assert.equal(String(mapTileIndex.bbox), String(test.bbox));
    });
  }
});

describe('getMapTileIndex parsing', () => {
  it('should parse a 1:50k sheet name with no tile id', () => {
    const index = MapSheet.getMapTileIndex('AS21.tiff');
    assert.equal(index?.mapSheet, 'AS21');
    assert.equal(index?.gridSize, 50_000);
  });

  // One valid tile name per grid size. Tile ids use 2 digits per axis, except
  // 1:500 which uses 3. Every axis value is inside the sheet's tile grid.
  const validTiles = [
    { name: 'BP27_10000_0102', gridSize: 10_000, y: 1, x: 2 },
    { name: 'BP27_5000_0203', gridSize: 5_000, y: 2, x: 3 },
    { name: 'BP27_2000_0102', gridSize: 2_000, y: 1, x: 2 },
    { name: 'BP27_1000_4817', gridSize: 1_000, y: 48, x: 17 },
    { name: 'CG10_500_080037', gridSize: 500, y: 80, x: 37 },
  ] as const;

  for (const tile of validTiles) {
    it(`should parse valid tile name ${tile.name}`, () => {
      const index = MapSheet.getMapTileIndex(tile.name);
      assert.equal(index?.gridSize, tile.gridSize);
      assert.equal(index?.x, tile.x);
      assert.equal(index?.y, tile.y);
    });
  }

  it('should parse a tile name with a prefix and file extension', () => {
    const index = MapSheet.getMapTileIndex('2022_CG10_500_080037.tiff');
    assert.equal(index?.x, 37);
    assert.equal(index?.y, 80);
  });

  // Names that cannot be faithfully parsed must return null rather than a tile
  // with silently-wrong coordinates.
  const invalidNames = [
    { name: 'no-map-sheet-here.tiff', why: 'no sheet code' },
    { name: 'BP27_1000_48', why: 'missing x component (would parse x as 0)' },
    { name: 'CG10_500_080', why: 'missing x component at 1:500' },
    { name: 'BP27_1000_481', why: 'tile id too short (3 digits, expected 4)' },
    { name: 'CG10_500_08003', why: 'tile id too short at 1:500 (5 digits, expected 6)' },
    { name: 'BP27_1000_48170', why: 'tile id too long (5 digits, expected 4)' },
    { name: 'BP27_1000_0050', why: 'tile y is 0, outside the 1-indexed grid' },
    { name: 'BP27_1000_9999', why: 'tile 99,99 is outside a 50x50 grid' },
  ] as const;

  for (const invalid of invalidNames) {
    it(`should return null for ${invalid.name} (${invalid.why})`, () => {
      assert.equal(MapSheet.getMapTileIndex(invalid.name), null);
    });
  }
});
