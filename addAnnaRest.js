const newPerformer = {
    fields: {
        id: { integerValue: 6 },
        name: { stringValue: 'Anna Ivky' },
        tagline: { stringValue: 'Sophistication and a hint of mystery.' },
        photo_url: { stringValue: 'https://picsum.photos/seed/anna/800/1200' },
        bio: { stringValue: 'Anna is the epitome of grace and professionalism. Her experience with exclusive, private events makes her the ideal choice for clients seeking a discreet yet impactful presence. Her poise and charm elevate any gathering.' },
        service_ids: { arrayValue: { values: [{ stringValue: 'waitress-lingerie' }, { stringValue: 'show-toy' }, { stringValue: 'show-works-greek' }, { stringValue: 'show-absolute-works' }] } },
        service_areas: { arrayValue: { values: [{ stringValue: 'Perth South' }, { stringValue: 'Southwest' }] } },
        status: { stringValue: 'available' },
        rating: { doubleValue: 5.0 },
        review_count: { integerValue: 89 },
        min_booking_duration_hours: { integerValue: 3 },
        created_at: { stringValue: '2024-03-09T00:00:00.000Z' }
    }
};

fetch('https://firestore.googleapis.com/v1/projects/studio-4495412314-3b1ce/databases/(default)/documents/performers/6', {
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(newPerformer)
})
    .then(res => res.json())
    .then(data => {
        console.log(data);
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
