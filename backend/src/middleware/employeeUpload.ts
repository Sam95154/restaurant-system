import multer from 'multer';
import path from 'path';
import fs from 'fs';

const photoDirectory = path.join(
  process.cwd(),
  'uploads',
  'employees',
  'photos',
);

const documentDirectory = path.join(
  process.cwd(),
  'uploads',
  'employees',
  'documents',
);

for (const directory of [photoDirectory, documentDirectory]) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }
}

const photoMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const photoExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

const documentMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const documentExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
]);

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, photoDirectory);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const safeName =
      `employee-photo-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}${extension}`;

    cb(null, safeName);
  },
});

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, documentDirectory);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const safeName =
      `employee-document-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}${extension}`;

    cb(null, safeName);
  },
});

const photoFileFilter: multer.Options['fileFilter'] = (
  _req,
  file,
  cb,
) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !photoMimeTypes.has(file.mimetype) ||
    !photoExtensions.has(extension)
  ) {
    cb(
      new Error(
        'Invalid employee photo format. Allowed formats: JPG, JPEG, PNG and WEBP.',
      ),
    );
    return;
  }

  cb(null, true);
};

const documentFileFilter: multer.Options['fileFilter'] = (
  _req,
  file,
  cb,
) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !documentMimeTypes.has(file.mimetype) ||
    !documentExtensions.has(extension)
  ) {
    cb(
      new Error(
        'Invalid employee document format. Allowed formats: JPG, JPEG, PNG, WEBP and PDF.',
      ),
    );
    return;
  }

  cb(null, true);
};

export const employeePhotoUpload = multer({
  storage: photoStorage,
  fileFilter: photoFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

export const employeeDocumentUpload = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});
