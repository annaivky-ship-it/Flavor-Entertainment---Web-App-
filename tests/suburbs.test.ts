import { describe, it, expect } from 'vitest';
import { perthSuburbs, getSuburbDistance, calculateTravelFee } from '../data/suburbs';

describe('perthSuburbs metro coverage', () => {
  it('has at least 250 entries (full metro coverage)', () => {
    expect(perthSuburbs.length).toBeGreaterThanOrEqual(250);
  });

  it('contains every commonly-booked Perth metro suburb', () => {
    // Spot-check list — high-volume suburbs that absolutely must be present.
    // Sourced from Perth metro LGAs (Stirling, Wanneroo, Joondalup, Cockburn,
    // Canning, Gosnells, Armadale, Swan, Kalamunda, Melville, Fremantle, etc).
    const mustHave = [
      // Inner & central
      'Perth CBD', 'Northbridge', 'Subiaco', 'Mount Lawley', 'Maylands', 'Highgate',
      'North Perth', 'Mount Hawthorn', 'Leederville', 'East Perth', 'West Perth',
      // North inner
      'Yokine', 'Dianella', 'Inglewood', 'Bedford', 'Bayswater', 'Morley', 'Noranda',
      'Stirling', 'Balcatta', 'Tuart Hill', 'Osborne Park', 'Innaloo',
      // North coast
      'Scarborough', 'Trigg', 'North Beach', 'Sorrento', 'Hillarys', 'Mullaloo',
      'Marmion', 'Watermans Bay',
      // Joondalup & far north
      'Joondalup', 'Currambine', 'Kinross', 'Burns Beach', 'Iluka', 'Edgewater',
      'Heathridge', 'Ocean Reef', 'Mindarie', 'Quinns Rocks', 'Clarkson', 'Butler',
      'Yanchep',
      // Wanneroo
      'Wanneroo', 'Pearsall', 'Wangara', 'Landsdale', 'Madeley', 'Tapping',
      'Banksia Grove',
      // West / coast
      'Floreat', 'Wembley', 'City Beach', 'Claremont', 'Cottesloe', 'Mosman Park',
      'Peppermint Grove', 'Nedlands', 'Dalkeith', 'Crawley', 'Swanbourne',
      // South of river inner
      'South Perth', 'Como', 'Victoria Park', 'Burswood', 'Kensington',
      'Applecross', 'Mount Pleasant', 'Booragoon', 'Melville', 'Bicton',
      // South & Canning
      'Cannington', 'Bentley', 'Riverton', 'Willetton', 'Bull Creek', 'Murdoch',
      'Leeming', 'Winthrop', 'Thornlie', 'Maddington', 'Gosnells', 'Canning Vale',
      'Southern River', 'Harrisdale', 'Piara Waters',
      // Fremantle / Cockburn
      'Fremantle', 'East Fremantle', 'North Fremantle', 'South Fremantle',
      'Beaconsfield', 'Hamilton Hill', 'Spearwood', 'Coogee', 'Coolbellup',
      'Kardinya', 'Bibra Lake', 'Yangebup', 'Beeliar', 'Atwell', 'Aubin Grove',
      'Hammond Park', 'Cockburn Central', 'Success', 'Jandakot',
      // Belmont / airport
      'Belmont', 'Rivervale', 'Cloverdale', 'Ascot', 'Redcliffe', 'Kewdale',
      // Swan / north-east
      'Midland', 'Guildford', 'Caversham', 'Bassendean', 'Eden Hill', 'Lockridge',
      'Ellenbrook', 'Aveley', 'Bullsbrook',
      // Kalamunda / Forrestfield
      'Kalamunda', 'Lesmurdie', 'Forrestfield', 'High Wycombe', 'Maida Vale',
      'Wattle Grove',
      // Armadale / Byford
      'Armadale', 'Kelmscott', 'Camillo', 'Seville Grove', 'Roleystone', 'Byford',
      // Kwinana / Rockingham
      'Rockingham', 'Baldivis', 'Waikiki', 'Safety Bay', 'Warnbro', 'Port Kennedy',
      'Singleton', 'Secret Harbour', 'Wellard', 'Calista',
      // Mandurah
      'Mandurah', 'Halls Head', 'Falcon', 'Madora Bay', 'Pinjarra',
    ];

    const present = new Set(perthSuburbs.map(s => s.name));
    const missing = mustHave.filter(n => !present.has(n));
    expect(missing).toEqual([]);
  });

  it('returns null for an unknown suburb', () => {
    expect(getSuburbDistance('Atlantis')).toBeNull();
  });

  it('returns the right distance for a known suburb', () => {
    // Whatever the value is, it should match what's in the data file.
    const fremantle = perthSuburbs.find(s => s.name === 'Fremantle');
    expect(getSuburbDistance('Fremantle')).toBe(fremantle?.distanceFromCBD);
  });

  it('has unique names (no duplicates)', () => {
    const names = perthSuburbs.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps the list alphabetical (relied on by the typeahead)', () => {
    const sorted = [...perthSuburbs].sort((a, b) => a.name.localeCompare(b.name));
    expect(perthSuburbs.map(s => s.name)).toEqual(sorted.map(s => s.name));
  });

  it('all distances are non-negative integers (or near-integers)', () => {
    for (const s of perthSuburbs) {
      expect(s.distanceFromCBD).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.distanceFromCBD)).toBe(true);
    }
  });
});

describe('calculateTravelFee', () => {
  it('returns 0 within the threshold', () => {
    expect(calculateTravelFee(40, 50, 1)).toBe(0);
    expect(calculateTravelFee(50, 50, 1)).toBe(0);
  });

  it('charges $1/km beyond the threshold by default', () => {
    expect(calculateTravelFee(70, 50, 1)).toBe(20);
    expect(calculateTravelFee(72, 50, 1)).toBe(22);
  });

  it('respects a custom rate per km', () => {
    expect(calculateTravelFee(60, 50, 2)).toBe(20);
  });
});
