import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDirectory = path.join(
  process.cwd(),
  'uploads',
  'expenses',
);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const allowedExtensions = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (_req, file, cb) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const safeName =
      `expense-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}${extension}`;

    cb(null, safeName);
  },
});

const fileFilter: multer.Options['fileFilter'] = (
  _req,
  file,
  cb,
) => {
  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  if (
    !allowedMimeTypes.has(file.mimetype) ||
    !allowedExtensions.has(extension)
  ) {
    cb(
      new Error(
        'Only PDF, JPG, JPEG, PNG, and WEBP receipt files are allowed.',
      ),
    );
    return;
  }

  cb(null, true);
};

export const expenseReceiptUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});
