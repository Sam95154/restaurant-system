import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDirectory = path.join(
  process.cwd(),
  'uploads',
  'restaurant-logo',
);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const allowedExtensions = new Set([
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
    const extension = path.extname(file.originalname).toLowerCase();

    const safeName =
      `logo-${Date.now()}-${Math.random()
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
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !allowedMimeTypes.has(file.mimetype) ||
    !allowedExtensions.has(extension)
  ) {
    cb(
      new Error(
        'Invalid logo format. Allowed formats: JPG, JPEG, PNG and WEBP.',
      ),
    );
    return;
  }

  cb(null, true);
};

export const restaurantLogoUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});