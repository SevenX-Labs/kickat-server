import { Module } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { BlogsController } from './blogs.controller';
import { BlogCategoriesController } from './blog-categories.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [BlogsController, BlogCategoriesController],
  providers: [BlogsService],
  exports: [BlogsService],
})
export class BlogsModule {}
