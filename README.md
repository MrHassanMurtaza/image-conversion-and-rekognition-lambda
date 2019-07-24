> AWS Lambda to convert image file and use aws rekognition to detect labels and store into mysql datbase

# image-conversion-and-rekognition-lambda

### → TLDR
This Lambda perform following functions
- Check image format and convert any format other than png and jpg/jpeg to png.
- Create thumbnail and preview from image using GraphicsMagick and store it to appropriate S3 buckets.
- Detect labels from image using AWS Rekognition.
- Store labels to mysql database.

Supported Formats are:
```jpg|jpeg|png|eps|eps2|tiff|svg|psd|ps|psb|heic|bmp|bmp2|bmp3```

### Tested On
- NodeJS 8.10
- You'll need to add lambda layer with following arn to the function because of GhostScript issue.
```arn:aws:lambda:::awslayer:AmazonLinux1703```

### Migrations
- Please run the migrations for mysql database. You'll find migrations in repository root folder.

### Environment Variables
- Setup environment variables in Lambda. You'll find their names in the ```Enviornment``` root file.

### License
IDC. You can use it the way you want. 
