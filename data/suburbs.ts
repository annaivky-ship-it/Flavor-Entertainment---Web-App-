// Perth suburbs with approximate distance from CBD (km)
// Used for travel fee calculation: $1/km for distances over 50km

export interface Suburb {
  name: string;
  distanceFromCBD: number; // in km
}

export const perthSuburbs: Suburb[] = [
  // CBD & Inner City (0-5km)
  { name: 'Perth CBD', distanceFromCBD: 0 },
  { name: 'Northbridge', distanceFromCBD: 1 },
  { name: 'East Perth', distanceFromCBD: 2 },
  { name: 'West Perth', distanceFromCBD: 2 },
  { name: 'South Perth', distanceFromCBD: 3 },
  { name: 'Subiaco', distanceFromCBD: 4 },
  { name: 'Leederville', distanceFromCBD: 3 },
  { name: 'Mount Lawley', distanceFromCBD: 4 },
  { name: 'Victoria Park', distanceFromCBD: 5 },

  // Inner Suburbs (5-15km)
  { name: 'Claremont', distanceFromCBD: 9 },
  { name: 'Cottesloe', distanceFromCBD: 11 },
  { name: 'Fremantle', distanceFromCBD: 19 },
  { name: 'Scarborough', distanceFromCBD: 12 },
  { name: 'Innaloo', distanceFromCBD: 9 },
  { name: 'Osborne Park', distanceFromCBD: 8 },
  { name: 'Morley', distanceFromCBD: 10 },
  { name: 'Bayswater', distanceFromCBD: 8 },
  { name: 'Cannington', distanceFromCBD: 12 },
  { name: 'Rivervale', distanceFromCBD: 6 },
  { name: 'Belmont', distanceFromCBD: 7 },
  { name: 'Como', distanceFromCBD: 6 },
  { name: 'Applecross', distanceFromCBD: 8 },
  { name: 'Melville', distanceFromCBD: 11 },
  { name: 'Nedlands', distanceFromCBD: 6 },
  { name: 'Dalkeith', distanceFromCBD: 7 },
  { name: 'Karrinyup', distanceFromCBD: 11 },

  // Middle Suburbs (15-30km)
  { name: 'Joondalup', distanceFromCBD: 26 },
  { name: 'Wanneroo', distanceFromCBD: 25 },
  { name: 'Hillarys', distanceFromCBD: 22 },
  { name: 'Duncraig', distanceFromCBD: 17 },
  { name: 'Warwick', distanceFromCBD: 15 },
  { name: 'Midland', distanceFromCBD: 18 },
  { name: 'Kalamunda', distanceFromCBD: 24 },
  { name: 'Mundaring', distanceFromCBD: 30 },
  { name: 'Armadale', distanceFromCBD: 28 },
  { name: 'Gosnells', distanceFromCBD: 20 },
  { name: 'Canning Vale', distanceFromCBD: 18 },
  { name: 'Cockburn', distanceFromCBD: 22 },
  { name: 'Success', distanceFromCBD: 25 },
  { name: 'Ellenbrook', distanceFromCBD: 28 },
  { name: 'Swan View', distanceFromCBD: 22 },

  // Outer Suburbs (30-50km)
  { name: 'Rockingham', distanceFromCBD: 40 },
  { name: 'Baldivis', distanceFromCBD: 42 },
  { name: 'Yanchep', distanceFromCBD: 48 },
  { name: 'Two Rocks', distanceFromCBD: 50 },
  { name: 'Byford', distanceFromCBD: 38 },
  { name: 'Serpentine', distanceFromCBD: 45 },
  { name: 'Bullsbrook', distanceFromCBD: 35 },
  { name: 'Gingin', distanceFromCBD: 50 },

  // Regional (50km+)
  { name: 'Mandurah', distanceFromCBD: 72 },
  { name: 'Pinjarra', distanceFromCBD: 86 },
  { name: 'Bunbury', distanceFromCBD: 175 },
  { name: 'Busselton', distanceFromCBD: 220 },
  { name: 'Margaret River', distanceFromCBD: 270 },
  { name: 'Geraldton', distanceFromCBD: 420 },
  { name: 'Kalgoorlie', distanceFromCBD: 595 },
  { name: 'Northam', distanceFromCBD: 97 },
  { name: 'York', distanceFromCBD: 97 },
  { name: 'Toodyay', distanceFromCBD: 85 },
  { name: 'Lancelin', distanceFromCBD: 105 },
  { name: 'Jurien Bay', distanceFromCBD: 220 },
  { name: 'Dunsborough', distanceFromCBD: 250 },
  { name: 'Collie', distanceFromCBD: 160 },
  { name: 'Harvey', distanceFromCBD: 140 },
].sort((a, b) => a.name.localeCompare(b.name));

export const getSuburbDistance = (suburbName: string): number | null => {
  const suburb = perthSuburbs.find(s => s.name === suburbName);
  return suburb ? suburb.distanceFromCBD : null;
};

export const calculateTravelFee = (distanceKm: number, thresholdKm: number, ratePerKm: number): number => {
  if (distanceKm <= thresholdKm) return 0;
  return (distanceKm - thresholdKm) * ratePerKm;
};
