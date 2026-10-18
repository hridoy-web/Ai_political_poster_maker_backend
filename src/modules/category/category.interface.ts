export interface ICreateCategoryInput  {
  name: string;
  slug: string;
  sortOrder?: number;
};

export interface UpdateCategoryInput{
  name?: string;
  slug?: string;
  sortOrder?: number;
};
