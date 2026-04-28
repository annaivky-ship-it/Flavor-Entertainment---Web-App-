import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import * as firestore from '@google-cloud/firestore';

const REGION = 'australia-southeast1';
const SCHEDULE = '0 3 * * *';
const TIME_ZONE = 'Australia/Sydney';

const firestoreAdminClient = new firestore.v1.FirestoreAdminClient();

export const scheduledFirestoreExport = onSchedule(
  {
    schedule: SCHEDULE,
    timeZone: TIME_ZONE,
    region: REGION,
    retryCount: 3,
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      throw new Error('GCLOUD_PROJECT/GCP_PROJECT env var is not set');
    }

    const databaseName = firestoreAdminClient.databasePath(projectId, '(default)');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputUriPrefix = `gs://${projectId}-firestore-backups/${timestamp}`;

    logger.info('Starting Firestore export', { databaseName, outputUriPrefix });

    try {
      const [response] = await firestoreAdminClient.exportDocuments({
        name: databaseName,
        outputUriPrefix,
        collectionIds: [],
      });
      logger.info('Firestore export operation started', {
        operationName: response.name,
        outputUriPrefix,
      });
    } catch (err) {
      logger.error('Firestore export failed', { err, outputUriPrefix });
      throw err;
    }
  }
);
